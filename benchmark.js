const bench = require('nanobench')

const loopCount = 200000

const generateString = (length = 1) => {
  let result = ''
  const characters = '0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() *
charactersLength))
  }
  return result
}

bench('operator', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    const num = +generateString()
  }

  b.end()
})

bench('parseInt', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    const num = parseInt(generateString(), 10)
  }

  b.end()
})

bench('Number()', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    const num = Number(generateString())
  }

  b.end()
})
