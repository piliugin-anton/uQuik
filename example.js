const uQuikServer = require('./')

// eslint-disable-next-line new-cap
const uQuik = new uQuikServer()

uQuik.get('/', (request, response) => {
  response.send('hello world')
})

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('Server started'))
  .catch((error) => console.log('Failed to start a server', error))
