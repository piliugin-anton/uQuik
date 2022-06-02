const bench = require('nanobench')

const loopCount = 2000

const keyCount = 16384
const keys = []
const map = new Map()

// Hide lookup keys to prevent V8 cheating (AKA Optimizing)
const getConspicuousKey = seed => keys[Math.floor(seed * keyCount)]

// Setup out test objects w/ random values
for (let i = 0; i < keyCount; i++) {
  const val = {
    test: Math.random() > 0.5
  }
  const key = Math.random()
  keys.push(key)
  map.set(key, val)
}

bench('forEach', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    map.forEach((value, key) => {
      const a = key + value
    })
  }

  b.end()
})

bench('for of', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    for (const [key, value] of map) {
      const a = key + value
    }
  }

  b.end()
})
