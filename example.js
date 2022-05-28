const { Server } = require('./')
const StaticFiles = require('./src/middleware/StaticFiles')

// eslint-disable-next-line new-cap
const uQuik = new Server()

uQuik.set_error_handler((request, response, error) => {
  console.log(error)
})

uQuik.use(StaticFiles())

uQuik.get('/*', () => {})
uQuik.head('/*', () => {})

/* uQuik.get('/', (req, res) => {
  res.send('hello world')
}) */

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
