/**
 * Module dependencies.
 */

const crypto = require('crypto')

/**
  * Sign the given `val` with `secret`.
  *
  * @param {String} val
  * @param {String} secret
  * @return {String}
  * @api private
  */

exports.sign = function (val, secret) {
  if (typeof val !== 'string') throw new TypeError('Cookie value must be provided as a string.')
  if (secret == null) throw new TypeError('Secret key must be provided.')
  return val + '.' + crypto
    .createHmac('sha256', secret)
    .update(val)
    .digest('base64')
    .replace(/\=+$/, '')
}

/**
  * Unsign and decode the given `input` with `secret`,
  * returning `false` if the signature is invalid.
  *
  * @param {String} input
  * @param {String} secret
  * @return {String|Boolean}
  * @api private
  */

exports.unsign = function (input, secret) {
  if (typeof input !== 'string') throw new TypeError('Signed cookie string must be provided.')
  if (secret == null) throw new TypeError('Secret key must be provided.')
  const tentativeValue = input.slice(0, input.lastIndexOf('.'))
  const expectedInput = exports.sign(tentativeValue, secret)
  const expectedBuffer = Buffer.from(expectedInput)
  const inputBuffer = Buffer.from(input)
  return (
    expectedBuffer.length === inputBuffer.length &&
     crypto.timingSafeEqual(expectedBuffer, inputBuffer)
  )
    ? tentativeValue
    : false
}
