const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const mimeTypes = require('./helpers/mime-types')
const accepts = require('./helpers/accepts')
const compressible = require('./helpers/compressible')

const CustomError = require('./CustomError')

const resolveFile = (file, indexFile = '') => {
  return fs.promises.stat(file, {
    bigint: false
  }).then((stats) => {
    if (stats.isDirectory()) {
      return resolveFile(path.join(file, indexFile))
    } else if (stats.isFile()) {
      return [file, stats]
    } else {
      throw new CustomError('404 Not Found', 404)
    }
  })
}

const destroy = (dataTransfer) => {
  if (dataTransfer.readable && !dataTransfer.readable.destroyed) dataTransfer.readable.destroy()
  if (dataTransfer.writable && !dataTransfer.writable.destroyed) dataTransfer.writable.destroy()
}

const StaticFiles = (options = {}) => {
  const opts = {
    root: path.resolve('www'),
    indexFile: 'index.html',
    compress: true,
    compressionThreshold: 1024,
    ...options
  }

  return async (req, res) => {
    const dataTransfer = {
      readable: null,
      writable: null
    }
    res.on('abort', () => destroy(dataTransfer))

    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).header('Allow', 'GET, HEAD').vary('Accept-Encoding').send()

    try {
      const [file, stats] = await resolveFile(req.path === '/' ? path.join(opts.root, opts.indexFile) : path.normalize(path.join(opts.root, req.path)), opts.indexFile)
      const mimeType = mimeTypes.lookup(file)

      stats.mtime.setMilliseconds(0)
      const timeUTC = stats.mtime.toUTCString()

      if (req.method === 'HEAD') {
        return res.status(200)
          .header('Content-Type', mimeType)
          .header('Content-Length', stats.size.toString())
          .header('Last-Modified', timeUTC)
          .vary('Accept-Encoding')
          .send()
      }

      const ifModifiedSince = req.get('if-modified-since')
      if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) return res.status(304).header('Last-Modified', timeUTC).vary('Accept-Encoding').send()

      // Compression
      let compression = null

      let { size } = stats
      let start = 0
      let end = size
      const range = req.range(size, { combine: true })
      if (range && range.type === 'bytes') {
        const singleRange = {
          start: end,
          end
        }

        const rangeLength = range.length
        for (let i = 0; i < rangeLength; i++) {
          const current = range[i]
          if (singleRange.start > current.start) singleRange.start = current.start
          singleRange.end = current.end
        }

        start = singleRange.start
        end = singleRange.end

        size = end - start + 1
        res.status(206)
          .header('Accept-Ranges', 'bytes')
          .header('Content-Range', `bytes ${start}-${end}/${size}`)
      } else {
        res.status(200)
        // Compression candidate?
        if (opts.compress && compressible(mimeType) && stats.size >= opts.compressionThreshold) {
          const accept = accepts(req)
          let method = accept.encoding(['gzip', 'deflate', 'identity'])

          // we really don't prefer deflate
          if (method === 'deflate' && accept.encoding(['gzip'])) {
            method = accept.encoding(['gzip', 'identity'])
          }

          // compression possible
          if (method && method !== 'identity') {
            compression = method
          }
        }
      }

      dataTransfer.readable = fs.createReadStream(file, {
        start,
        end
      })

      res
        .header('Content-Type', mimeType)
        .header('Last-Modified', timeUTC)
        .vary('Accept-Encoding')

      if (compression) {
        res.header('Content-Encoding', compression)

        dataTransfer.writable = zlib.createGzip()

        dataTransfer.writable.once('end', () => !dataTransfer.writable.destroyed && dataTransfer.writable.destroy())

        dataTransfer.readable
          .pipe(dataTransfer.writable)
          .pipe(res)
      } else {
        return res.stream(dataTransfer.readable, size)
      }
    } catch (ex) {
      if (ex.status && ex.status === 404) return res.master_context.handlers.get('on_not_found')(req, res)
      res.throw(ex)
    }
  }
}

module.exports = StaticFiles
