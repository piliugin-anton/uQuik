const { Server } = require('.')

const uquik = new Server()

uquik.get('/users/:userId', (request, response) => {
  response.send(`User ID: ${request.path_parameters.get('userId')}`)
})

uquik.get('/users/:userId/:method', (request, response) => {
  response.send(
    `User ID: ${request.path_parameters.get(
      'userId'
    )}, method: ${request.path_parameters.get('method')}`
  )
})

uquik
  .listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
