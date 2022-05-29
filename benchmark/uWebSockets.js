const uWS = require('uWebSockets.js')
const port = 5001

uWS.App().get('/', (res, req) => {
  res.end('Hello World!')
}).listen(port, (token) => {
  if (token) {
    console.log('Listening to port ' + port)
  } else {
    console.log('Failed to listen to port ' + port)
  }
})
