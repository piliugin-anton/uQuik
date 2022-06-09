const MIME_RE = /^([^/]+)\/([^;]+)/

// Score RFC facets (see https://tools.ietf.org/html/rfc6838#section-3)
const FACET_SCORES = {
  'prs.': 100,
  'x-': 200,
  'x.': 300,
  'vnd.': 400,
  default: 900
}

// Score mime source (Logic originally from `jshttp/mime-types` module)
const SOURCE_SCORES = {
  nginx: 10,
  apache: 20,
  iana: 40,
  default: 30 // definitions added by `jsttp/mime-db` project?
}

const TYPE_SCORES = {
  // prefer application/xml over text/xml
  // prefer application/rtf over text/rtf
  application: 1,

  // prefer font/woff over application/font-woff
  font: 2,

  default: 0
}

/**
 * @typedef {Object} MimeScore
 * @property {Number} facet RFC facet score (sets 100's digit)
 * @property {Number} source Source score (sets 10's digit)
 * @property {Number} type RFC type (sets 1's digit)
 * @property {Number} length Length score (sets fraction, shorter = higher score)
 */

/**
 * Get each component of the score for a mime type.  The sum of these is the
 * total score.  The higher the score, the more "official" the type.
 *
 * @param {String} mimeType The mime type. E.g. "image/bmp"
 * @param {String} [source] Organization that defines the type
 *
 * @return {MimeScore}
 */
function mimeScore (mimeType, source) {
  const match = mimeType.match(MIME_RE)
  if (!match) return { total: 0 }

  const type = match[1]
  const subtype = match[2]
  const facetMatch = subtype.match(/^([a-z]+\.|x-)/)
  const facet = (facetMatch && facetMatch[1]) || undefined

  const facetScore = FACET_SCORES[facet] || FACET_SCORES.default
  const sourceScore = SOURCE_SCORES[source] || SOURCE_SCORES.default
  const typeScore = TYPE_SCORES[type] || TYPE_SCORES.default

  // All other things being equal, prefer shorter types
  const lengthScore = 1 - mimeType.length / 100

  return {
    parts: {
      facet: [facet, facetScore],
      source: [source, sourceScore],
      type: [type, typeScore],
      length: [mimeType.length, lengthScore]
    },
    total: facetScore + sourceScore + typeScore + lengthScore
  }
}

module.exports = mimeScore
