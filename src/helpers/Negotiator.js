class Negotiator {
  constructor (request) {
    this.headers = request.headers
  }

  get simpleMediaTypeRegExp () {
    return /^\s*([^\s/;]+)\/([^;\s]+)\s*(?:;(.*))?$/
  }

  get simpleCharsetEncodingRegExp () {
    return /^\s*([^\s;]+)\s*(?:;(.*))?$/
  }

  get simpleLanguageRegExp () {
    return /^\s*([^\s\-;]+)(?:-([^\s;]+))?\s*(?:;(.*))?$/
  }

  charset (available) {
    const set = this.charsets(available)
    return set && set[0]
  }

  charsets (provided) {
    return this.preferred(this.headers.get('accept-charset'), provided, 'charset')
  }

  encoding (available) {
    const set = this.encodings(available)
    return set && set[0]
  }

  encodings (provided) {
    return this.preferred(this.headers.get('accept-encoding'), provided, 'encoding')
  }

  language (available) {
    const set = this.languages(available)
    return set && set[0]
  }

  languages (provided) {
    return this.preferred(this.headers.get('accept-language'), provided, 'language')
  }

  mediaType (available) {
    const set = this.mediaTypes(available)
    return set && set[0]
  }

  mediaTypes (provided) {
    return this.preferred(this.headers.accept, provided, 'media')
  }

  preferred (accept, provided, what) {
    // RFC 2616 sec 14.2: no header = *
    const acceptParameter = {
      charset: accept === undefined ? '*' : accept,
      language: accept === undefined ? '*' : accept,
      media: accept === undefined ? '*/*' : accept,
      encoding: accept || ''
    }
    const acceptParser = {
      charset: 'parseAcceptCharsetLanguageMedia',
      language: 'parseAcceptCharsetLanguageMedia',
      media: 'parseAcceptCharsetLanguageMedia',
      encoding: 'parseAcceptEncoding'
    }
    const parameter = acceptParameter[what]
    const accepts = this[acceptParser[what]](parameter || '', what)

    if (!provided) {
      // sorted list of all charsets
      const mappings = {
        charset: (spec) => spec.charset,
        language: (spec) => spec.full,
        encoding: (spec) => spec.encoding,
        media: (spec) => spec.type + '/' + spec.subtype
      }

      return accepts
        .filter(this.isQuality)
        .sort(this.compareSpecs)
        .map((v) => mappings[what](v))
    }

    const priorities = provided.map((type, index) => this.getPriority(type, accepts, index, what))

    // sorted list of accepted charsets
    return priorities.filter(this.isQuality).sort(this.compareSpecs).map((priority) => {
      return provided[priorities.indexOf(priority)]
    })
  }

  parseAcceptCharsetLanguageMedia (accept, what) {
    const accepts = what === 'media' ? this.splitMediaTypes(accept) : accept.split(',')
    const whateverMappings = {
      charset: 'parseCharsetEncoding',
      language: 'parseLanguage',
      media: 'parseMediaType'
    }

    let j = 0
    for (let i = 0; i < accepts.length; i++) {
      const whatever = this[whateverMappings[what]](accepts[i].trim(), i, what)

      if (whatever) {
        accepts[j++] = whatever
      }
    }

    return accepts.slice(0, j)
  }

  parseAcceptEncoding (accept) {
    const accepts = accept.split(',')
    let hasIdentity = false
    let minQuality = 1

    let i = 0
    let j = 0
    for (; i < accepts.length; i++) {
      const encoding = this.parseCharsetEncoding(accepts[i].trim(), i, 'encoding')

      if (encoding) {
        accepts[j++] = encoding
        hasIdentity = hasIdentity || this.specify('identity', encoding, undefined, 'encoding')
        minQuality = Math.min(minQuality, encoding.q || 1)
      }
    }

    if (!hasIdentity) {
      /*
       * If identity doesn't explicitly appear in the accept-encoding header,
       * it's added to the list of acceptable encoding with the lowest q
       */
      accepts[j++] = {
        encoding: 'identity',
        q: minQuality,
        i
      }
    }

    return accepts.splice(0, j)
  }

  parseCharsetEncoding (str, i, what) {
    const match = this.simpleCharsetEncodingRegExp.exec(str)
    if (!match) return null

    const keyMappings = {
      charset: 'charset',
      language: 'language',
      encoding: 'encoding'
    }
    const key = keyMappings[what]

    const whatever = match[1]
    let q = 1
    if (match[2]) {
      const params = match[2].split(';')
      for (let j = 0; j < params.length; j++) {
        const p = params[j].trim().split('=')
        if (p[0] === 'q') {
          q = parseFloat(p[1])
          break
        }
      }
    }

    return {
      [key]: whatever,
      q,
      i
    }
  }

  parseLanguage (str, i) {
    const match = this.simpleLanguageRegExp.exec(str)
    if (!match) return null

    const prefix = match[1]
    const suffix = match[2]
    let full = prefix

    if (suffix) full += '-' + suffix

    let q = 1
    if (match[3]) {
      const params = match[3].split(';')
      for (let j = 0; j < params.length; j++) {
        const p = params[j].split('=')
        if (p[0] === 'q') q = parseFloat(p[1])
      }
    }

    return {
      prefix,
      suffix,
      q,
      i,
      full
    }
  }

  parseMediaType (str, i) {
    const match = this.simpleMediaTypeRegExp.exec(str)
    if (!match) return null

    const params = Object.create(null)
    let q = 1
    const subtype = match[2]
    const type = match[1]

    if (match[3]) {
      const kvps = this.splitParameters(match[3]).map(this.splitKeyValuePair)

      for (let j = 0; j < kvps.length; j++) {
        const pair = kvps[j]
        const key = pair[0].toLowerCase()
        const val = pair[1]

        // get the value, unwrapping quotes
        const value = val && val[0] === '"' && val[val.length - 1] === '"'
          ? val.substr(1, val.length - 2)
          : val

        if (key === 'q') {
          q = parseFloat(value)
          break
        }

        // store parameter
        params[key] = value
      }
    }

    return {
      type,
      subtype,
      params,
      q,
      i
    }
  }

  getPriority (whatever, accepted, index, what) {
    let priority = { o: -1, q: 0, s: 0 }

    const specifyMappings = {
      charset: 'specify',
      language: 'specifyLanguage',
      encoding: 'specify',
      media: 'specifyMedia'
    }

    for (let i = 0; i < accepted.length; i++) {
      const spec = this[specifyMappings[what]](whatever, accepted[i], index, what)

      if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
        priority = spec
      }
    }

    return priority
  }

  specify (whatever, spec, index, what) {
    let s = 0
    const keyMappings = {
      charset: 'charset',
      encoding: 'encoding'
    }
    const key = keyMappings[what]
    if (spec[key].toLowerCase() === whatever.toLowerCase()) {
      s |= 1
    } else if (spec[key] !== '*') {
      return null
    }

    return {
      i: index,
      o: spec.i,
      q: spec.q,
      s
    }
  }

  specifyLanguage (language, spec, index) {
    const p = this.parseLanguage(language)
    if (!p) return null
    let s = 0
    if (spec.full.toLowerCase() === p.full.toLowerCase()) {
      s |= 4
    } else if (spec.prefix.toLowerCase() === p.full.toLowerCase()) {
      s |= 2
    } else if (spec.full.toLowerCase() === p.prefix.toLowerCase()) {
      s |= 1
    } else if (spec.full !== '*') {
      return null
    }

    return {
      i: index,
      o: spec.i,
      q: spec.q,
      s
    }
  }

  specifyMedia (type, spec, index) {
    const p = this.parseMediaType(type)
    let s = 0

    if (!p) {
      return null
    }

    if (spec.type.toLowerCase() === p.type.toLowerCase()) {
      s |= 4
    } else if (spec.type !== '*') {
      return null
    }

    if (spec.subtype.toLowerCase() === p.subtype.toLowerCase()) {
      s |= 2
    } else if (spec.subtype !== '*') {
      return null
    }

    const keys = Object.keys(spec.params)
    if (keys.length > 0) {
      if (keys.every(function (k) {
        return spec.params[k] === '*' || (spec.params[k] || '').toLowerCase() === (p.params[k] || '').toLowerCase()
      })) {
        s |= 1
      } else {
        return null
      }
    }

    return {
      i: index,
      o: spec.i,
      q: spec.q,
      s
    }
  }

  compareSpecs (a, b) {
    return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0
  }

  isQuality (spec) {
    return spec.q > 0
  }

  quoteCount (string) {
    let count = 0
    let index = 0

    while ((index = string.indexOf('"', index)) !== -1) {
      count++
      index++
    }

    return count
  }

  splitKeyValuePair (str) {
    const index = str.indexOf('=')
    let key
    let val

    if (index === -1) {
      key = str
    } else {
      key = str.substr(0, index)
      val = str.substr(index + 1)
    }

    return [key, val]
  }

  splitMediaTypes (accept) {
    const accepts = accept.split(',')

    let j = 0
    for (let i = 1; i < accepts.length; i++) {
      if (this.quoteCount(accepts[j]) % 2 === 0) {
        accepts[++j] = accepts[i]
      } else {
        accepts[j] += ',' + accepts[i]
      }
    }

    return accepts.slice(0, j + 1)
  }

  splitParameters (str) {
    let parameters = str.split(';')

    let j = 0
    for (let i = 1; i < parameters.length; i++) {
      if (this.quoteCount(parameters[j]) % 2 === 0) {
        parameters[++j] = parameters[i]
      } else {
        parameters[j] += ';' + parameters[i]
      }
    }

    // trim parameters
    parameters = parameters.slice(0, j + 1)

    for (let i = 0; i < parameters.length; i++) {
      parameters[i] = parameters[i].trim()
    }

    return parameters
  }
}

module.exports = Negotiator
