const bench = require('nanobench')
const Negotiator = require('./src/helpers/Negotiator')

const randomCharset = () => {
  const charsets = [
    'utf-8',
    'iso-8859-1',
    'windows-1251',
    'windows-1252'
  ]

  return charsets[Math.floor(Math.random() * charsets.length)]
}

const randomEncoding = () => {
  const encodings = [
    'gzip',
    'compress',
    'deflate',
    'br',
    'identity'
  ]

  return encodings[Math.floor(Math.random() * encodings.length)]
}

const randomLanguage = () => {
  const languages = [
    'ru-RU',
    'fr-CH',
    'en-US',
    'de-CH'
  ]

  return languages[Math.floor(Math.random() * languages.length)]
}

const randomQuality = () => {
  return Math.random().toFixed(1)
}

const randomAcceptHeader = (what = 'charset') => {
  const array = []
  while (array.length < 3) {
    let random
    if (what === 'charset') {
      random = randomCharset()
    } else if (what === 'encoding') {
      random = randomEncoding()
    } else if (what === 'language') {
      random = randomLanguage()
    }

    let string
    if (array.length === 0) {
      string = random
    } else if (array.length < 2) {
      string = random + ';q=' + randomQuality()
    } else {
      string = '*;q=0.1'
    }

    if (array.indexOf(string) === -1) {
      array.push(string)
    }
  }

  return array.join(', ')
}

// Accept-Charset: utf-8, iso-8859-1;q=0.5, *;q=0.1
bench('Negotiator default', (b) => {
  b.start()

  for (let i = 0; i < 10; i++) {
    const header = randomAcceptHeader('language')
    const available = []
    while (available.length < 2) {
      const random = randomLanguage()
      if (available.indexOf(random) === -1) {
        available.push(random)
      }
    }
    console.log('header', header)
    console.log('available', available)
    console.log(Negotiator.preferredLanguages(header, available))
  }

  b.end()
})
