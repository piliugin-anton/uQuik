const isString = (v) => typeof v === 'string'
const isNumber = (v, integer = false) => {
  const isNumeric = typeof v === 'number'

  if (integer) return isNumeric && Number.isInteger(v)

  return isNumeric
}
const isObject = (v) => v !== null && typeof v === 'object'
const isArray = (v) => Array.isArray(v)
const isFunction = (v) => typeof v === 'function'

const isRouter = (v) => isObject(v) && v.constructor.name === 'uQuikRouter'
const isServer = (v) => isObject(v) && v.constructor.name === 'uQuikServer'

const wrapObject = (original, target) => {
  Object.keys(target).forEach((key) => {
    if (typeof target[key] === 'object') {
      if (Array.isArray(target[key])) return (original[key] = target[key]) // lgtm [js/prototype-pollution-utility]
      if (original[key] === null || typeof original[key] !== 'object') original[key] = {}
      wrapObject(original[key], target[key])
    } else {
      original[key] = target[key]
    }
  })
}

const parsePathParameters = (pattern) => {
  const results = []
  let counter = 0
  if (pattern.indexOf('/:') > -1) {
    const chunks = pattern.split('/').filter((chunk) => chunk.length > 0)
    for (let index = 0; index < chunks.length; index++) {
      const current = chunks[index]
      if (current.startsWith(':') && current.length > 2) {
        results.push([current.substring(1), counter])
        counter++
      }
    }
  }
  return results
}

const arrayBufferToString = (arrayBuffer, encoding = 'utf8') => {
  return Buffer.from(arrayBuffer).toString(encoding)
}

const asyncAwait = (delay) => {
  return new Promise((resolve) => setTimeout((res) => res(), delay, resolve))
}

const mergeRelativePaths = (basePath, newPath) => {
  // handle both roots merger case
  if (basePath === '/' && newPath === '/') return '/'

  // Inject leading slash to newPath
  if (!newPath.startsWith('/')) newPath = '/' + newPath

  // handle base root merger case
  if (basePath === '/') return newPath

  // handle new path root merger case
  if (newPath === '/') return basePath

  // strip away leading slash from base path
  if (basePath.endsWith('/')) basePath = basePath.substr(0, basePath.length - 1)

  // Merge path and add a slash in between if newPath does not have a starting slash
  return `${basePath}${newPath}`
}

module.exports.isNumber = isNumber
module.exports.isString = isString
module.exports.isObject = isObject
module.exports.isArray = isArray
module.exports.isFunction = isFunction

module.exports.isRouter = isRouter
module.exports.isServer = isServer

module.exports.wrapObject = wrapObject
module.exports.parsePathParameters = parsePathParameters
module.exports.arrayBufferToString = arrayBufferToString
module.exports.asyncAwait = asyncAwait
module.exports.mergeRelativePaths = mergeRelativePaths
