const bench = require('nanobench')
const { getIP } = require('./src/utils')

const loopCount = 200000

const generateIP = () => {
  let uint8Array
  if (Math.random() > 0.5) {
    uint8Array = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
      uint8Array[i] = Math.floor(Math.random() * 255)
    }
  } else {
    uint8Array = new Uint8Array(4)
    for (let i = 0; i < 4; i++) {
      uint8Array[i] = Math.floor(Math.random() * 255)
    }
  }

  return uint8Array.buffer
}

bench('getIP', (b) => {
  b.start()

  for (let i = 0; i < loopCount; i++) {
    getIP(generateIP())
  }

  b.end()
})
