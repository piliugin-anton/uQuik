const isString = (v) => typeof v === 'string'
const isNumber = (v, integer = false) => {
  const isNumeric = typeof v === 'number'

  if (integer) return isNumeric && Number.isInteger(v)

  return isNumeric
}
const isObject = (v) => v !== null && typeof v === 'object'
const isFunction = (v) => typeof v === 'function'

module.exports.isNumber = isNumber
module.exports.isString = isString
module.exports.isObject = isObject
module.exports.isFunction = isFunction
