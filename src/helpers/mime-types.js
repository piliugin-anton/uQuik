/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const db = require('./mime-db.json')
const mimeScore = require('./mime-score')
const extname = require('path').extname

/**
 * Module variables.
 * @private
 */

const EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/
const TEXT_TYPE_REGEXP = /^text\//i

/**
 * Module exports.
 * @public
 */

exports.charset = charset
exports.charsets = { lookup: charset }
exports.contentType = contentType
exports.extension = extension
exports.extensions = Object.create(null)
exports.lookup = lookup
exports.types = Object.create(null)

// Populate the extensions/types maps
populateMaps(exports.extensions, exports.types)
/**
 * Get the default charset for a MIME type.
 *
 * @param {string} type
 * @return {boolean|string}
 */

function charset (type) {
  if (!type || typeof type !== 'string') return false

  // TODO: use media-typer
  const match = EXTRACT_TYPE_REGEXP.exec(type)
  const mime = match && db[match[1].toLowerCase()]

  if (mime && mime.charset) return mime.charset

  // default text/* to utf-8
  if (match && TEXT_TYPE_REGEXP.test(match[1])) return 'UTF-8'

  return false
}

/**
 * Create a full Content-Type header given a MIME type or extension.
 *
 * @param {string} str
 * @return {boolean|string}
 */

function contentType (str) {
  // TODO: should this even be in this module?
  if (!str || typeof str !== 'string') return false

  let mime = str.indexOf('/') === -1
    ? exports.lookup(str)
    : str

  if (!mime) return false

  // TODO: use content-type or other module
  if (mime.indexOf('charset') === -1) {
    const charset = exports.charset(mime)
    if (charset) mime += '; charset=' + charset.toLowerCase()
  }

  return mime
}

/**
 * Get the default extension for a MIME type.
 *
 * @param {string} type
 * @return {boolean|string}
 */

function extension (type) {
  if (!type || typeof type !== 'string') return false

  // TODO: use media-typer
  const match = EXTRACT_TYPE_REGEXP.exec(type)

  // get extensions
  const exts = match && exports.extensions[match[1].toLowerCase()]

  if (!exts || !exts.length) return false

  return exts[0]
}

/**
 * Lookup the MIME type for a file path/extension.
 *
 * @param {string} path
 * @return {boolean|string}
 */

function lookup (path) {
  if (!path || typeof path !== 'string') {
    return false
  }

  // get the extension ("ext" or ".ext" or full path)
  const extension = extname('x.' + path)
    .toLowerCase()
    .slice(1)

  if (!extension) return false

  return exports.types[extension] || false
}

/**
 * Populate the extensions and types maps.
 * @private
 */

function populateMaps (extensions, types) {
  for (const type in db) {
    const mime = db[type]
    const exts = mime.extensions

    if (!exts || !exts.length) continue

    // mime -> extensions
    extensions[type] = exts

    // extension -> mime
    const extensionsLength = exts.length
    for (let i = 0; i < extensionsLength; i++) {
      const extension = exts[i]

      if (types[extension]) {
        // const from = preference.indexOf(db[types[extension]].source)
        // const to = preference.indexOf(mime.source)

        // if (types[extension] !== 'application/octet-stream' && (from > to || (from === to && types[extension].slice(0, 12) === 'application/'))) continue

        const from = mimeScore(types[extension], db[types[extension]].source)
        const to = mimeScore(type, mime.source)

        // skip the remapping
        if (from > to) continue
      }

      // set the extension -> mime
      types[extension] = type
    }
  }
}
