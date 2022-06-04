const path = require('path')
const { Server, CORS } = require('./')

// eslint-disable-next-line new-cap
const uQuik = new Server()

uQuik.set_error_handler((request, response, error) => {
  console.log(error)
})

uQuik.use(CORS())

uQuik.head('/', (req, res) => {
  // Replace LENGTH with actual value
  res.status(200).header('content-type', 'application/json').send()
})

uQuik.options('/', (req, res) => res.status(200).header('Allow', 'GET, HEAD, PUT, PATCH, POST, DELETE').send())

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
}, async (req, res) => {
  return res.redirect('http://127.0.0.1:5000/test')
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
  // res.send('hello world')
  // res.json(await req.json())
})

uQuik.listen(5000, '127.0.0.1')
  .then((socket) => console.log('[Example] Server started'))
  .catch((error) => console.log('[Example] Failed to start a server', error))
