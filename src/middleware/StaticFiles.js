const path = require('path')
const fs = require('fs')
const zlib = require('zlib')

const mimeTypes = require('../helpers/mime-types')
const accepts = require('../helpers/accepts')
const compressible = require('../helpers/compressible')

const resolveFile = (file, indexFile = '') => {
  return fs.promises.stat(file, {
    bigint: false
  }).then((stats) => {
    if (stats.isDirectory()) {
      return resolveFile(path.join(file, indexFile))
    } else if (stats.isFile()) {
      return [file, stats]
    } else {
      throw new Error(`${file} is not a file`)
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
    res.once('abort', () => destroy(dataTransfer))
    // res.on('error', () => destroy(streams))

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.atomic(() => {
        res.status(405).header('Allow', 'GET, HEAD').vary('Accept-Encoding').send()
      })
    }

    try {
      const [file, stats] = await resolveFile(req.path === '/' ? path.join(opts.root, opts.indexFile) : path.normalize(path.join(opts.root, req.path)), opts.indexFile)
      const mimeType = mimeTypes.lookup(path.extname(file))

      if (req.method === 'HEAD') {
        return res.atomic(() => {
          res.status(200)
            .header('Content-Type', mimeType)
            .header('Content-Length', stats.size.toString())
            .header('Last-Modified', stats.mtime.toUTCString())
            .vary('Accept-Encoding')
            .send(undefined, undefined, true)
        })
      }

      dataTransfer.readable = fs.createReadStream(file)
      dataTransfer.readable.once('end', () => !dataTransfer.readable.destroyed && dataTransfer.readable.destroy())

      // Compression
      let compression = null
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

      res.atomic(() => {
        res.status(200)
          .header('Content-Type', mimeType)
          .header('Last-Modified', stats.mtime.toUTCString())
          .vary('Accept-Encoding')
      })

      if (compression) {
        res.header('Content-Encoding', compression)

        dataTransfer.writable = zlib.createGzip()

        dataTransfer.writable.once('end', () => !dataTransfer.writable.destroyed && dataTransfer.writable.destroy())

        res.stream(dataTransfer.writable)

        return dataTransfer.readable.pipe(dataTransfer.writable)
      } else {
        return res.stream(dataTransfer.readable, stats.size)
      }
    } catch (ex) {
      return !res.completed && res.status(404).send(`File not found: ${req.path}`)
    }
  }
}

module.exports = StaticFiles
