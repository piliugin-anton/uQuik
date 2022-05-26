const mime = require('mime-types')
const Negotiator = require('./Negotiator')

/**
 * Check if the given `type(s)` is acceptable, returning
 * the best match when true, otherwise `undefined`, in which
 * case you should respond with 406 "Not Acceptable".
 */
class Accepts {
  constructor (headers) {
    this.headers = typeof headers === 'string' ? this.parseHeaders(headers) : headers
    this.negotiator = new Negotiator(this.headers)
  }

  get acceptRegex () {
    return /Accept: (.*)/gi
  }

  get encodingRegex () {
    return /Accept-Encoding: (.*)/gi
  }

  get languageRegex () {
    return /Accept-Language: (.*)/gi
  }

  get charsetRegex () {
    return /Accept-Charset: (.*)/gi
  }

  parseHeaders (h) {
    const headers = {}
    const accept = this.acceptRegex.exec(h)
    if (accept && accept.length > 1) {
      headers.accept = accept[1]
    }
    const acceptLanguage = this.languageRegex.exec(h)
    if (acceptLanguage && acceptLanguage.length > 1) {
      headers['accept-language'] = acceptLanguage[1]
    }
    const acceptEncoding = this.encodingRegex.exec(h)
    if (acceptEncoding && acceptEncoding.length > 1) {
      headers['accept-encoding'] = acceptEncoding[1]
    }
    const acceptCharset = this.charsetRegex.exec(h)
    if (acceptCharset && acceptCharset.length > 1) {
      headers['accept-charset'] = acceptCharset[1]
    }

    return headers
  }

  types (types_) {
    let types = types_

    // support flattened arguments
    if (types && !Array.isArray(types)) {
      types = new Array(arguments.length)
      for (let i = 0; i < types.length; i++) {
        types[i] = arguments[i]
      }
    }

    // no types, return all requested types
    if (!types || types.length === 0) {
      return this.negotiator.mediaTypes()
    }

    // no accept header, return first given type
    if (!this.headers.accept) {
      return types[0]
    }

    const mimes = types.map(this.extToMime)
    const accepts = this.negotiator.mediaTypes(mimes.filter(this.validMime))
    const first = accepts[0]

    return first
      ? types[mimes.indexOf(first)]
      : false
  }

  encodings (encodings_) {
    let encodings = encodings_

    // support flattened arguments
    if (encodings && !Array.isArray(encodings)) {
      encodings = new Array(arguments.length)
      for (let i = 0; i < encodings.length; i++) {
        encodings[i] = arguments[i]
      }
    }

    // no encodings, return all requested encodings
    if (!encodings || encodings.length === 0) {
      return this.negotiator.encodings()
    }

    return this.negotiator.encodings(encodings)[0] || false
  }

  charsets (charsets_) {
    let charsets = charsets_

    // support flattened arguments
    if (charsets && !Array.isArray(charsets)) {
      charsets = new Array(arguments.length)
      for (let i = 0; i < charsets.length; i++) {
        charsets[i] = arguments[i]
      }
    }

    // no charsets, return all requested charsets
    if (!charsets || charsets.length === 0) {
      return this.negotiator.charsets()
    }

    return this.negotiator.charsets(charsets)[0] || false
  }

  languages (languages_) {
    let languages = languages_

    // support flattened arguments
    if (languages && !Array.isArray(languages)) {
      languages = new Array(arguments.length)
      for (let i = 0; i < languages.length; i++) {
        languages[i] = arguments[i]
      }
    }

    // no languages, return all requested languages
    if (!languages || languages.length === 0) {
      return this.negotiator.languages()
    }

    return this.negotiator.languages(languages)[0] || false
  }

  extToMime (type) {
    return type.indexOf('/') === -1
      ? mime.lookup(type)
      : type
  }

  validMime (type) {
    return typeof type === 'string'
  }
}

module.exports = Accepts
