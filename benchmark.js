const bench = require('nanobench')
const { test } = require('./src/helpers/media-typer')

const loopCount = 20000000

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

const getRandomElement = () => {
  const keys = [
    'test6'
  ]

  return keys[Math.floor(Math.random() * keys.length)]
}

const object = {
  test6: {
    test: 123
  }
}

const objectWithMap = {
  test6: new Map()
}

objectWithMap.test6.set('test', 123)

const mapWithObject = new Map()
mapWithObject.set('test6', {
  test: 123
})

const map = new Map()
const test6 = new Map()
test6.set('test', 123)
map.set('test6', test6)

bench('object', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    let value = object.test6.test
    value = 1
  }

  b.end()
})

bench('objectWithMap', (b) => {
  b.start()
  for (let i = 0; i < loopCount; ++i) {
    let value = objectWithMap.test6.get('test')
    value = 1
  }

  b.end()
})

bench('map', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    let value = map.get('test6').get('test')
    value = 1
  }

  b.end()
})

bench('mapWithObject', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    let value = mapWithObject.get('test6').test
    value = 1
  }

  b.end()
})
