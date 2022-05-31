const inherits = require('util').inherits
const { Readable } = require('readable-stream')

function PartStream (opts) {
  Readable.call(this, opts)
}
inherits(PartStream, Readable)

PartStream.prototype._read = function (n) {}

module.exports = PartStream
