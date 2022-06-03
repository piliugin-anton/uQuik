const { Server } = require('./')
const path = require('path')
const blocked = require('blocked-at')

blocked((time, stack) => {
  console.log(`Blocked for ${time}ms, operation started here:`, stack)
})

// eslint-disable-next-line new-cap
const uQuik = new Server()

uQuik.set_error_handler((request, response, error) => {
  console.log(error)
})

// uQuik.get('/', (req, res) => res.send('hello world'))

// uQuik.use(StaticFiles())

// uQuik.get('/*', () => {})
// uQuik.head('/*', () => {})

uQuik.head('/header', (req, res) => res.header('content-length', false).send())

uQuik.any('/', {
  /* schema: {
    request: {
      properties: {
        test: {
          type: 'boolean'
        }
      }
    },
    response: {
      properties: {
        test: {
          type: 'boolean'
        }
      }
    }
  } */
}, (req, res) => {
  /* try {
    await req.multipart(async (field) => {
      // Ensure that this field is a file-type
      // You may also perform your own checks on the encoding and mime type as needed
      if (field.file) {
        console.log('field', field.file.name)
        field.write(path.join(__dirname, 'test', field.file.name)).then(() => {
          res.send('ok')
        }).catch((err) => console.log('Error while writing file', err))
      }
    })
  } catch (error) {
    // The multipart parser may throw a string constant as an error
    // Be sure to handle these as stated in the documentation
    if (error === 'FILES_LIMIT_REACHED') {
      return res.status(403).send('You sent too many files! Try again.')
    } else {
      console.log(error)
      return res.status(500).send('Oops! An uncaught error occured on our end.')
    }
  } */
  res.send('hello world')
  // console.log(await req.json())
})

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
