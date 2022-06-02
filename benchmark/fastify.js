// Require the framework and instantiate it
const fastify = require('fastify')()

// Declare a route
fastify.get('/', async (request, reply) => {
  reply.send('hello world')
})

// Run the server!
const start = async () => {
  try {
    await fastify.listen(5003)
    console.log('Fastify is running on port 5003')
  } catch (err) {
    process.exit(1)
  }
}
start()
