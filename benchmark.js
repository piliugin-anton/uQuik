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

const testObject = {
  testProperty: ['123', '456']
}

bench('for', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    let t
    for (const name in testObject) {
      for (const value of testObject[name]) {
        t = name + value
      }
    }
  }

  b.end()
})

bench('for in + regular for', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    let t
    for (const name in testObject) {
      const length = testObject[name].length
      for (let i = 0; i < length; i++) {
        t = name + testObject[name][i]
      }
    }
  }

  b.end()
})

bench('Object.keys()', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    let t
    Object.keys(testObject).forEach((name) =>
      testObject[name].forEach((value) => (t = name + value)))
  }

  b.end()
})
