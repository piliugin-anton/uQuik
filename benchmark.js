// const bench = require('nanobench')

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

Promise.resolve(() => new Promise((resolve, reject) => setTimeout(() => reject(new Error('sdfs')), 100))).then((msg) => console.log(msg)).catch((ex) => console.log(ex))

/* bench('Object', (b) => {
  b.start()

  const object = {}

  for (let i = 0; i < loopCount; ++i) {
    object[`key_${i}`] = 1
  }

  let result = 0

  for (let i = 0; i < loopCount; ++i) {
    result += object[`key_${i}`]
  }

  b.end()
})

bench('Map', (b) => {
  b.start()

  const map = new Map()

  for (let i = 0; i < loopCount; ++i) {
    map.set(`key_${i}`, 1)
  }

  let result = 0

  for (let i = 0; i < loopCount; ++i) {
    result += map.get(`key_${i}`)
  }

  b.end()
})

bench('Set', (b) => {
  b.start()

  const set = new Set()

  for (let i = 0; i < loopCount; ++i) {
    set.add(`key_${i}`)
  }

  let result = 0

  for (let i = 0; i < loopCount; ++i) {
    result += set.has(`key_${i}`)
  }

  b.end()
}) */
