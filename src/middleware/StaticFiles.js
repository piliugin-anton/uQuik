const path = require('path')
const fs = require('fs')
const zlib = require('zlib')

const mimeTypes = require('../helpers/mime-types')
const accepts = require('../helpers/accepts')
const compressible = require('../helpers/compressible')

const resolveFile = (file, success, error, indexFile = '') => {
  fs.promises.stat(file, {
    bigint: false
  }).then((stats) => {
    if (stats.isDirectory()) {
      resolveFile(path.join(file, indexFile), success, error)
    } else if (stats.isFile()) {
      success(file, stats)
    } else {
      error(file)
    }
  }).catch((ex) => error(file))
}

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

    resolveFile(filePath, (file, stats) => {
      const mimeType = mimeTypes.lookup(path.extname(file))

      if (req.method === 'HEAD') {
        return res.status(200).header('Content-Type', mimeType).header('Content-Length', stats.size.toString()).send(undefined, undefined, true)
      }

      res.status(200).header('Content-Type', mimeType)

      const fileReadableStream = fs.createReadStream(file)
      fileReadableStream.once('end', () => {
        fileReadableStream.close()
      })

      // Compression
      let compression = null
      // Compression candidate?
      if (compressible(mimeType) && stats.size >= opts.compressionThreshold) {
        res.vary('Accept-Encoding')

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
        zlibStream.once('end', () => zlibStream.close())
        res.stream(zlibStream)
        fileReadableStream.pipe(zlibStream)
        fileReadableStream.once('end', () => {
          fileReadableStream.unpipe(zlibStream)
        })
      } else {
        res.stream(fileReadableStream, stats.size)
      }
    }, (file) => res.status(404).send(), opts.indexFile)
  }
}

module.exports = StaticFiles
