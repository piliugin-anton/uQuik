const path = require('path')
const fs = require('fs')
const zlib = require('zlib')

const mimeTypes = require('../helpers/mime-types')
const accepts = require('../helpers/accepts')
const compressible = require('../helpers/compressible')

const resolveFile = async (file, success, error, indexFile = '') => {
  try {
    const stats = await fs.promises.stat(file, {
      bigint: false
    })

    if (stats.isDirectory()) {
      resolveFile(path.join(file, indexFile), success, error)
    } else if (stats.isFile()) {
      success(file, stats)
    } else {
      error(file)
    }
  } catch (ex) {
    error(file)
  }
}

const handle404 = (res, file) => res.status(404).send(`File ${file} not found`)

const StaticFiles = (options = {}) => {
  const opts = {
    root: path.resolve('www'),
    indexFile: 'index.html',
    compress: true,
    compressionThreshold: 1024,
    ...options
  }

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).header('Allow', 'GET, HEAD').send()
    }

    const filePath = req.path === '/' ? path.join(opts.root, opts.indexFile) : path.normalize(path.join(opts.root, req.path))

    resolveFile(
      filePath,
      (file, stats) => {
        const mimeType = mimeTypes.lookup(path.extname(file))

        if (req.method === 'HEAD') {
          return res.status(200)
            .header('Content-Type', mimeType)
            .header('Content-Length', stats.size.toString())
            .header('Last-Modified', stats.mtime.toUTCString())
            .vary('Accept-Encoding')
            .send(undefined, undefined, true)
        }

        res.status(200)
          .header('Content-Type', mimeType)
          .header('Last-Modified', stats.mtime.toUTCString())
          .vary('Accept-Encoding')

        const fileReadableStream = fs.createReadStream(file)
        fileReadableStream.once('end', () => {
          fileReadableStream.close()
          fileReadableStream.destroy()
        })
        fileReadableStream.once('error', () => fileReadableStream.destroy())

        // Compression
        let compression = null
        // Compression candidate?
        if (compressible(mimeType) && stats.size >= opts.compressionThreshold) {
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

        if (compression) {
          res.header('Content-Encoding', compression)
          const zlibStream = zlib.createGzip()
          zlibStream.once('end', () => {
            zlibStream.destroy()
            // res.send(undefined, undefined, true)
          })
          zlibStream.once('error', () => zlibStream.destroy())
          res.stream(zlibStream)
          fileReadableStream.once('error', () => {
            fileReadableStream.unpipe(zlibStream)
            zlibStream.destroy()
          })
          fileReadableStream.pipe(zlibStream)
        } else {
          res.stream(fileReadableStream, stats.size)
        }
      },
      (file) => handle404(res, file),
      opts.indexFile
    )
  }
}

module.exports = StaticFiles
