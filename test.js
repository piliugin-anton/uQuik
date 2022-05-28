const buffer = new SharedArrayBuffer(4)
const uint8 = new Uint32Array(buffer)

console.log(Atomics.store(uint8, 0, 2))
// expected output: 2

console.log(Atomics.load(uint8, 0))
// expected output: 2

console.log(Atomics.store(uint8, 0, 3))
// expected output: 2

console.log(uint8)
