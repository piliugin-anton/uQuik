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

const obj = {
  test: 123,
  test2: {
    test: 12312,
    test2: true,
    test3: {
      test: 0
    }
  },
  test3: true
}

const promise = new Promise((resolve) => setTimeout(() => resolve(), 0))
console.log(Object.prototype.toString.call(promise))

bench('instaceof', (b) => {
  b.start()
  for (let i = 0; i < loopCount; ++i) {
    let isPromise
    if (promise instanceof Promise) isPromise = 1
  }

  b.end()
})

bench('toString()', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    let isPromise
    if (Object.prototype.toString.call(promise) === '[object Promise]') isPromise = 1
  }

  b.end()
})

bench('2x typeof', (b) => {
  b.start()

  for (let i = 0; i < loopCount; ++i) {
    let isPromise
    if (typeof promise === 'object' && typeof promise.then === 'function') isPromise = 1
  }

  b.end()
})
