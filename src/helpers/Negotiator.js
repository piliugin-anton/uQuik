class Negotiator {
  static get simpleMediaTypeRegExp () {
    return /^\s*([^\s/;]+)\/([^;\s]+)\s*(?:;(.*))?$/
  }

  static get simpleCharsetEncodingRegExp () {
    return /^\s*([^\s;]+)\s*(?:;(.*))?$/
  }

  static get simpleLanguageRegExp () {
    return /^\s*([^\s\-;]+)(?:-([^\s;]+))?\s*(?:;(.*))?$/
  }

  static preferredCharset (accept) {
    return Negotiator.preferred(accept, undefined, 'Charset')
  }

  static preferredCharsets (accept, provided) {
    return Negotiator.preferred(accept, provided, 'Charset')
  }

  static preferredEncoding (accept) {
    return Negotiator.preferred(accept, undefined, 'Encoding')
  }

  static preferredEncodings (accept, provided) {
    return Negotiator.preferred(accept, provided, 'Encoding')
  }

  static preferredLanguage (accept) {
    return Negotiator.preferred(accept, undefined, 'Language')
  }

  static preferredLanguages (accept, provided) {
    return Negotiator.preferred(accept, provided, 'Language')
  }

  static preferred (accept, provided, what) {
    // RFC 2616 sec 14.2: no header = *
    const parameter = (what === 'Charset' || what === 'Language') ? accept === undefined ? (what === 'Media' ? '*/*' : '*') : accept : accept
    const accepts = Negotiator[`parseAccept${(what === 'Charset' || what === 'Language' || what === 'Media') ? 'CharsetLanguageMedia' : what}`](parameter || '', what)

    if (!provided) {
      // sorted list of all charsets
      let mapping = 'encoding'
      if (what === 'Charset') {
        mapping = 'charset'
      } else if (what === 'Language') {
        mapping = 'full'
      }

      return accepts
        .filter(Negotiator.isQuality)
        .sort(Negotiator.compareSpecs)
        .map((v) => what === 'Media' ? v.type + '/' + v.subtype : v[mapping])
    }

    const priorities = provided.map((type, index) => {
      return Negotiator.getPriority(type, accepts, index, what.toLowerCase())
    })

    // sorted list of accepted charsets
    return priorities.filter(Negotiator.isQuality).sort(Negotiator.compareSpecs).map((priority) => {
      return provided[priorities.indexOf(priority)]
    })
  }

  static parseAcceptCharsetLanguageMedia (accept, what) {
    const accepts = what === 'Media' ? Negotiator.splitMediaTypes(accept) : accept.split(',')

    let j = 0
    for (let i = 0; i < accepts.length; i++) {
      const whatever = what === 'Language' ? Negotiator.parseLanguage(accepts[i].trim(), i) : Negotiator.parseCharsetEncoding(accepts[i].trim(), i, what.toLowerCase())

      if (whatever) {
        accepts[j++] = whatever
      }
    }

    return accepts.slice(0, j)
  }

  static parseAcceptEncoding (accept) {
    const accepts = accept.split(',')
    let hasIdentity = false
    let minQuality = 1

    let i = 0
    let j = 0
    for (; i < accepts.length; i++) {
      const encoding = Negotiator.parseCharsetEncoding(accepts[i].trim(), i, 'encoding')

      if (encoding) {
        accepts[j++] = encoding
        hasIdentity = hasIdentity || Negotiator.specify('identity', encoding, undefined, 'encoding')
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

  static parseCharsetEncoding (str, i, what) {
    const match = Negotiator.simpleCharsetEncodingRegExp.exec(str)
    if (!match) return null

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
      [what]: whatever,
      q,
      i
    }
  }

  static parseLanguage (str, i) {
    const match = Negotiator.simpleLanguageRegExp.exec(str)
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

  static parseMediaType (str, i) {
    const match = Negotiator.simpleMediaTypeRegExp.exec(str)
    if (!match) return null

    const params = Object.create(null)
    let q = 1
    const subtype = match[2]
    const type = match[1]

    if (match[3]) {
      const kvps = Negotiator.splitParameters(match[3]).map(Negotiator.splitKeyValuePair)

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

  static getPriority (whatever, accepted, index, what) {
    let priority = { o: -1, q: 0, s: 0 }

    for (let i = 0; i < accepted.length; i++) {
      let spec = Negotiator.specify(whatever, accepted[i], index, what)
      if (what === 'Language') {
        spec = Negotiator.specifyLanguage(whatever, accepted[i], index)
      } else if (what === 'Media') {
        spec = Negotiator.specifyMedia(whatever, accepted[i], index)
      }

      if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
        priority = spec
      }
    }

    return priority
  }

  static specify (whatever, spec, index, what) {
    let s = 0
    console.log('whatever spec what', whatever, spec, what)
    if (spec[what].toLowerCase() === whatever.toLowerCase()) {
      s |= 1
    } else if (spec[what] !== '*') {
      return null
    }

    return {
      i: index,
      o: spec.i,
      q: spec.q,
      s
    }
  }

  static specifyLanguage (language, spec, index) {
    const p = Negotiator.parseLanguage(language)
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

  static specifyMedia (type, spec, index) {
    const p = Negotiator.parseMediaType(type)
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

  static compareSpecs (a, b) {
    return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0
  }

  static isQuality (spec) {
    return spec.q > 0
  }

  static quoteCount (string) {
    let count = 0
    let index = 0

    while ((index = string.indexOf('"', index)) !== -1) {
      count++
      index++
    }

    return count
  }

  static splitKeyValuePair (str) {
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

  static splitMediaTypes (accept) {
    const accepts = accept.split(',')

    let j = 0
    for (let i = 1; i < accepts.length; i++) {
      if (Negotiator.quoteCount(accepts[j]) % 2 === 0) {
        accepts[++j] = accepts[i]
      } else {
        accepts[j] += ',' + accepts[i]
      }
    }

    return accepts.slice(0, j + 1)
  }

  static splitParameters (str) {
    let parameters = str.split(';')

    let j = 0
    for (let i = 1; i < parameters.length; i++) {
      if (Negotiator.quoteCount(parameters[j]) % 2 === 0) {
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
