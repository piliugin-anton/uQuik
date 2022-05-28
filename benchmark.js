const bench = require('nanobench')

const loopCount = 100000

const generateString = (length = 3) => {
  let result = ''
  const characters = '0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() *
charactersLength))
  }
  return result
}

bench('Number', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    Number(generateString())
  }

  b.end()
})

bench('parseInt', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    parseInt(generateString())
  }

  b.end()
})
