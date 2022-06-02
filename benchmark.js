const bench = require('nanobench')

const loopCount = 2000000000

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

const object = {
  test: 'sdf',
  test2: true,
  test3: 42,
  test4: 234.23
}

bench('for in', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    for (const name in object) {
      //
    }
  }

  b.end()
})

bench('Object.keys() for', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    const keys = Object.keys(object)
    const length = keys.length
    for (let i2 = 0; i2 < length; i2++) {
      const name = keys[i2]
    }
  }

  b.end()
})
