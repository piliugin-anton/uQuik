const { Server } = require('./')
const StaticFiles = require('./src/middleware/StaticFiles')
const path = require('path')

// eslint-disable-next-line new-cap
const uQuik = new Server()
const rootFolder = path.resolve(__dirname, 'www')

uQuik.use(StaticFiles())

uQuik.all('/*', () => {})

// uQuik.get('/*', (req, res) => res.static(rootFolder, req.path))

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
