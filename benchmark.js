const bench = require('nanobench')
const Accepts = require('./src/helpers/Accepts')

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

const randomMedia = () => {
  const medias = [
    'text/html',
    'application/xhtml+xml',
    'application/xml',
    'text/html',
    'application/json',
    'text/plain'
  ]

  return medias[Math.floor(Math.random() * medias.length)]
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
    } else if (what === 'media') {
      random = randomMedia()
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

bench('Negotiator default', (b) => {
  b.start()

  for (let i = 0; i < 1; i++) {
    // const accepts = new Accepts({
    //  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    //  'accept-language': 'en-US,en;q=0.5',
    //  'accept-encoding': 'gzip, deflate, br',
    //  'accept-Charset': 'utf-8, iso-8859-1;q=0.5, *;q=0.1'
    // })
    const accepts = new Accepts(`GET /search?channel=fs&client=ubuntu&q=http+accept+headers HTTP/2
Host: www.google.com
User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:100.0) Gecko/20100101 Firefox/100.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
Accept-Charset: utf-8, iso-8859-1;q=0.5, *;q=0.1
Connection: keep-alive
Cookie: 1P_JAR=2022-05-26-06; NID=511=cmHAyRSv9sT0ibnSfxqouZoLVAl1rCpiGspcVgfZTroPiWx8770YW1yDl_ahFdkpWWlQvNUoeNU1g6cML4gVAqi4nQHo0_GPN9UsBqOtNYhupx3oNFsKbnXxGoVF_224CfMbs30OJw8P-uCnu8cJhso1b1kcvgcqzfowtJWm_1Y; AEC=AakniGN7hOklVcDQSXMej0OoRkJ3wwCkFEalVCw1cuKpguFoU2Ajf3Z4aTY; DV=Q1NCNGN-ESEuMMcVFBCaGUkwh8jwDxgF0nFRkRRgNQEAAAA
Upgrade-Insecure-Requests: 1
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: cross-site
Pragma: no-cache
Cache-Control: no-cache
TE: trailers`)
    accepts.types()
    accepts.charsets()
    accepts.encodings()
    accepts.languages()
  }

  b.end()
})
