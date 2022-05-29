// Require the framework and instantiate it
const fastify = require('fastify')

// Declare a route
fastify.get('/', async (request, reply) => {
  reply.send('hello world')
})

// Run the server!
const start = async () => {
  try {
    await fastify.listen(5003)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
