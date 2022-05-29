'use strict'

const has = Object.prototype.hasOwnProperty
const isArray = Array.isArray

// Extracted from utils.js
const decode = function (str, decoder, charset) {
  const strWithoutPlus = str.replace(/\+/g, ' ')
  if (charset === 'iso-8859-1') {
    // unescape never throws, no try...catch needed:
    return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape)
  }
  // utf-8
  try {
    return decodeURIComponent(strWithoutPlus)
  } catch (e) {
    return strWithoutPlus
  }
}

// Extracted from utils.js
const maybeMap = function maybeMap (val, fn) {
  if (isArray(val)) {
    const mapped = []
    for (let i = 0; i < val.length; i += 1) {
      mapped.push(fn(val[i]))
    }
    return mapped
  }
  return fn(val)
}

// Extracted from utils.js
const combine = function combine (a, b) {
  return [].concat(a, b)
}

// Extracted from utils.js
const isRegExp = function isRegExp (obj) {
  return Object.prototype.toString.call(obj) === '[object RegExp]'
}

// Extracted from utils.js
const compact = function compact (value) {
  const queue = [{ obj: { o: value }, prop: 'o' }]
  const refs = []

  for (let i = 0; i < queue.length; ++i) {
    const item = queue[i]
    const obj = item.obj[item.prop]

    const keys = Object.keys(obj)
    for (let j = 0; j < keys.length; ++j) {
      const key = keys[j]
      const val = obj[key]
      if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
        queue.push({ obj, prop: key })
        refs.push(val)
      }
    }
  }

  compactQueue(queue)

  return value
}

// Extracted from utils.js
const merge = function merge (target, source, options) {
  /* eslint no-param-reassign: 0 */
  if (!source) {
    return target
  }

  if (typeof source !== 'object') {
    if (isArray(target)) {
      target.push(source)
    } else if (target && typeof target === 'object') {
      if ((options && (options.plainObjects || options.allowPrototypes)) || !has.call(Object.prototype, source)) {
        target[source] = true
      }
    } else {
      return [target, source]
    }

    return target
  }

  if (!target || typeof target !== 'object') {
    return [target].concat(source)
  }

  let mergeTarget = target
  if (isArray(target) && !isArray(source)) {
    mergeTarget = arrayToObject(target, options)
  }

  if (isArray(target) && isArray(source)) {
    source.forEach(function (item, i) {
      if (has.call(target, i)) {
        const targetItem = target[i]
        if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
          target[i] = merge(targetItem, item, options)
        } else {
          target.push(item)
        }
      } else {
        target[i] = item
      }
    })
    return target
  }

  return Object.keys(source).reduce(function (acc, key) {
    const value = source[key]

    if (has.call(acc, key)) {
      acc[key] = merge(acc[key], value, options)
    } else {
      acc[key] = value
    }
    return acc
  }, mergeTarget)
}

// Extracted from utils.js
const arrayToObject = function arrayToObject (source, options) {
  const obj = options && options.plainObjects ? Object.create(null) : {}
  for (let i = 0; i < source.length; ++i) {
    if (typeof source[i] !== 'undefined') {
      obj[i] = source[i]
    }
  }

  return obj
}

// Extracted from utils.js
const compactQueue = function compactQueue (queue) {
  while (queue.length > 1) {
    const item = queue.pop()
    const obj = item.obj[item.prop]

    if (isArray(obj)) {
      const compacted = []

      for (let j = 0; j < obj.length; ++j) {
        if (typeof obj[j] !== 'undefined') {
          compacted.push(obj[j])
        }
      }

      item.obj[item.prop] = compacted
    }
  }
}

const defaults = {
  allowDots: false,
  allowPrototypes: false,
  allowSparse: false,
  arrayLimit: 20,
  charset: 'utf-8',
  charsetSentinel: false,
  comma: false,
  decoder: decode,
  delimiter: '&',
  depth: 5,
  ignoreQueryPrefix: false,
  interpretNumericEntities: false,
  parameterLimit: 1000,
  parseArrays: true,
  plainObjects: false,
  strictNullHandling: false
}

const interpretNumericEntities = function (str) {
  return str.replace(/&#(\d+);/g, function ($0, numberStr) {
    return String.fromCharCode(Number(numberStr))
  })
}

const parseArrayValue = function (val, options) {
  if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
    return val.split(',')
  }

  return val
}

// This is what browsers will submit when the ✓ character occurs in an
// application/x-www-form-urlencoded body and the encoding of the page containing
// the form is iso-8859-1, or when the submitted form has an accept-charset
// attribute of iso-8859-1. Presumably also with other charsets that do not contain
// the ✓ character, such as us-ascii.
const isoSentinel = 'utf8=%26%2310003%3B' // encodeURIComponent('&#10003;')

// These are the percent-encoded utf-8 octets representing a checkmark, indicating that the request actually is utf-8 encoded.
const charsetSentinel = 'utf8=%E2%9C%93' // encodeURIComponent('✓')

const parseValues = function parseQueryStringValues (str, options) {
  const obj = {}
  const cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str
  const limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit
  const parts = cleanStr.split(options.delimiter, limit)
  let skipIndex = -1 // Keep track of where the utf8 sentinel was found
  let i

  let charset = options.charset
  if (options.charsetSentinel) {
    for (i = 0; i < parts.length; ++i) {
      if (parts[i].indexOf('utf8=') === 0) {
        if (parts[i] === charsetSentinel) {
          charset = 'utf-8'
        } else if (parts[i] === isoSentinel) {
          charset = 'iso-8859-1'
        }
        skipIndex = i
        i = parts.length // The eslint settings do not allow break;
      }
    }
  }

  for (i = 0; i < parts.length; ++i) {
    if (i === skipIndex) {
      continue
    }
    const part = parts[i]

    const bracketEqualsPos = part.indexOf(']=')
    const pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1

    let key, val
    if (pos === -1) {
      key = options.decoder(part, defaults.decoder, charset, 'key')
      val = options.strictNullHandling ? null : ''
    } else {
      key = options.decoder(part.slice(0, pos), defaults.decoder, charset, 'key')
      val = maybeMap(
        parseArrayValue(part.slice(pos + 1), options),
        function (encodedVal) {
          return options.decoder(encodedVal, defaults.decoder, charset, 'value')
        }
      )
    }

    if (val && options.interpretNumericEntities && charset === 'iso-8859-1') {
      val = interpretNumericEntities(val)
    }

    if (part.indexOf('[]=') > -1) {
      val = isArray(val) ? [val] : val
    }

    if (has.call(obj, key)) {
      obj[key] = combine(obj[key], val)
    } else {
      obj[key] = val
    }
  }

  return obj
}

const parseObject = function (chain, val, options, valuesParsed) {
  let leaf = valuesParsed ? val : parseArrayValue(val, options)

  for (let i = chain.length - 1; i >= 0; --i) {
    let obj
    const root = chain[i]

    if (root === '[]' && options.parseArrays) {
      obj = [].concat(leaf)
    } else {
      obj = options.plainObjects ? Object.create(null) : {}
      const cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root
      const index = Number(cleanRoot)
      if (!options.parseArrays && cleanRoot === '') {
        obj = { 0: leaf }
      } else if (
        !isNaN(index) &&
                root !== cleanRoot &&
                String(index) === cleanRoot &&
                index >= 0 &&
                (options.parseArrays && index <= options.arrayLimit)
      ) {
        obj = []
        obj[index] = leaf
      } else if (cleanRoot !== '__proto__') {
        obj[cleanRoot] = leaf
      }
    }

    leaf = obj
  }

  return leaf
}

const parseKeys = function parseQueryStringKeys (givenKey, val, options, valuesParsed) {
  if (!givenKey) {
    return
  }

  // Transform dot notation to bracket notation
  const key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey

  // The regex chunks

  const brackets = /(\[[^[\]]*])/
  const child = /(\[[^[\]]*])/g

  // Get the parent

  let segment = options.depth > 0 && brackets.exec(key)
  const parent = segment ? key.slice(0, segment.index) : key

  // Stash the parent if it exists

  const keys = []
  if (parent) {
    // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
    if (!options.plainObjects && has.call(Object.prototype, parent)) {
      if (!options.allowPrototypes) {
        return
      }
    }

    keys.push(parent)
  }

  // Loop through children appending to the array until we hit depth

  let i = 0
  while (options.depth > 0 && (segment = child.exec(key)) !== null && i < options.depth) {
    i += 1
    if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
      if (!options.allowPrototypes) {
        return
      }
    }
    keys.push(segment[1])
  }

  // If there's a remainder, just add whatever is left

  if (segment) {
    keys.push('[' + key.slice(segment.index) + ']')
  }

  return parseObject(keys, val, options, valuesParsed)
}

const normalizeParseOptions = function normalizeParseOptions (opts) {
  if (!opts) {
    return defaults
  }

  if (opts.decoder !== null && opts.decoder !== undefined && typeof opts.decoder !== 'function') {
    throw new TypeError('Decoder has to be a function.')
  }

  if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
    throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined')
  }
  const charset = typeof opts.charset === 'undefined' ? defaults.charset : opts.charset

  return {
    allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
    allowPrototypes: typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
    allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
    arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
    charset,
    charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
    comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
    decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
    delimiter: typeof opts.delimiter === 'string' || isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
    // eslint-disable-next-line no-implicit-coercion, no-extra-parens
    depth: (typeof opts.depth === 'number' || opts.depth === false) ? +opts.depth : defaults.depth,
    ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
    interpretNumericEntities: typeof opts.interpretNumericEntities === 'boolean' ? opts.interpretNumericEntities : defaults.interpretNumericEntities,
    parameterLimit: typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
    parseArrays: opts.parseArrays !== false,
    plainObjects: typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
    strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
  }
}

module.exports = function (str, opts) {
  const options = normalizeParseOptions(opts)

  if (str === '' || str === null || typeof str === 'undefined') {
    return options.plainObjects ? Object.create(null) : {}
  }

  const tempObj = typeof str === 'string' ? parseValues(str, options) : str
  let obj = options.plainObjects ? Object.create(null) : {}

  // Iterate over the keys and setup the new object

  const keys = Object.keys(tempObj)
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]
    const newObj = parseKeys(key, tempObj[key], options, typeof str === 'string')
    obj = merge(obj, newObj, options)
  }

  if (options.allowSparse === true) {
    return obj
  }

  return compact(obj)
}
