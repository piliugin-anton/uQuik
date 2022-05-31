const { Server } = require('./')
const StaticFiles = require('./src/middleware/StaticFiles')

// eslint-disable-next-line new-cap
const uQuik = new Server()

uQuik.set_error_handler((request, response, error) => {
  console.log(error)
})

// uQuik.get('/', (req, res) => res.send('hello world'))

// uQuik.use(StaticFiles())

// uQuik.get('/*', () => {})
// uQuik.head('/*', () => {})

uQuik.any('/:test', {
  schema: {
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
  }
}, async (req, res) => {
  try {
    await req.multipart(async (field) => {
      // Ensure that this field is a file-type
      // You may also perform your own checks on the encoding and mime type as needed
      if (field.file) {
        console.log('field', field)
      }
    })
  } catch (error) {
    // The multipart parser may throw a string constant as an error
    // Be sure to handle these as stated in the documentation
    if (error === 'FILES_LIMIT_REACHED') {
      return res.status(403).send('You sent too many files! Try again.')
    } else {
      return res.status(500).send('Oops! An uncaught error occured on our end.')
    }
  }
})

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
