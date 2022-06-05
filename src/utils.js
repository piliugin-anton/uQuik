const byteToHex = [
  '00',
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '0a',
  '0b',
  '0c',
  '0d',
  '0e',
  '0f',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '1a',
  '1b',
  '1c',
  '1d',
  '1e',
  '1f',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '2a',
  '2b',
  '2c',
  '2d',
  '2e',
  '2f',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '3a',
  '3b',
  '3c',
  '3d',
  '3e',
  '3f',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '4a',
  '4b',
  '4c',
  '4d',
  '4e',
  '4f',
  '50',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '59',
  '5a',
  '5b',
  '5c',
  '5d',
  '5e',
  '5f',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '68',
  '69',
  '6a',
  '6b',
  '6c',
  '6d',
  '6e',
  '6f',
  '70',
  '71',
  '72',
  '73',
  '74',
  '75',
  '76',
  '77',
  '78',
  '79',
  '7a',
  '7b',
  '7c',
  '7d',
  '7e',
  '7f',
  '80',
  '81',
  '82',
  '83',
  '84',
  '85',
  '86',
  '87',
  '88',
  '89',
  '8a',
  '8b',
  '8c',
  '8d',
  '8e',
  '8f',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '96',
  '97',
  '98',
  '99',
  '9a',
  '9b',
  '9c',
  '9d',
  '9e',
  '9f',
  'a0',
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'a6',
  'a7',
  'a8',
  'a9',
  'aa',
  'ab',
  'ac',
  'ad',
  'ae',
  'af',
  'b0',
  'b1',
  'b2',
  'b3',
  'b4',
  'b5',
  'b6',
  'b7',
  'b8',
  'b9',
  'ba',
  'bb',
  'bc',
  'bd',
  'be',
  'bf',
  'c0',
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'c7',
  'c8',
  'c9',
  'ca',
  'cb',
  'cc',
  'cd',
  'ce',
  'cf',
  'd0',
  'd1',
  'd2',
  'd3',
  'd4',
  'd5',
  'd6',
  'd7',
  'd8',
  'd9',
  'da',
  'db',
  'dc',
  'dd',
  'de',
  'df',
  'e0',
  'e1',
  'e2',
  'e3',
  'e4',
  'e5',
  'e6',
  'e7',
  'e8',
  'e9',
  'ea',
  'eb',
  'ec',
  'ed',
  'ee',
  'ef',
  'f0',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'fa',
  'fb',
  'fc',
  'fd',
  'fe',
  'ff'
]

const fastArrayJoin = (array, separator = '') => {
  const length = array.length
  const last = length - 1
  let result = ''
  for (let i = 0; i < length; i++) {
    result += i !== last ? array[i] + separator : array[i]
  }
  return result
}

const getIP = (ab) => {
  if (ab.byteLength === 0) return ''

  const uint8array = new Uint8Array(ab)
  if (uint8array.length === 4) {
    return fastArrayJoin(uint8array, '.')
  } else {
    const hexOctets = new Array(8)
    const length = uint8array.length
    let index = 0
    for (let i = 0; i < length; i += 2) {
      hexOctets[index] = (byteToHex[uint8array[i]] + byteToHex[uint8array[i + 1]])
      index++
    }
    return fastArrayJoin(hexOctets, ':')
  }
}

const isString = (v) => typeof v === 'string'
const isNumber = (v, integer = false) => {
  const isNumeric = typeof v === 'number'

  if (integer) return isNumeric && Number.isInteger(v)

  return isNumeric
}
const isObject = (v) => v !== null && typeof v === 'object'
const isFunction = (v) => typeof v === 'function'
const isPromise = (v) => typeof v === 'object' && typeof v.then === 'function'

const isRouter = (v) => isObject(v) && v.constructor.name === 'Router'
const isServer = (v) => isObject(v) && v.constructor.name === 'Server'

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

const asyncWait = (delay) => {
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
module.exports.isArray = Array.isArray
module.exports.isFunction = isFunction
module.exports.isPromise = isPromise

module.exports.isRouter = isRouter
module.exports.isServer = isServer

module.exports.fastArrayJoin = fastArrayJoin
module.exports.getIP = getIP

module.exports.parsePathParameters = parsePathParameters
module.exports.asyncWait = asyncWait
module.exports.mergeRelativePaths = mergeRelativePaths
