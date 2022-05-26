const { Server } = require('./')

// eslint-disable-next-line new-cap
const uQuik = new Server()

uQuik.get('/', (req, res) => {
  res.send('hello world')
})

uQuik.delete('/test', (req, res) => {
  res.send('delete')
})

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
