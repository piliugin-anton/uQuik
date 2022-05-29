const HyperExpress = require('hyper-express')
const webserver = new HyperExpress.Server()

// Create GET route to serve 'Hello World'
webserver.get('/', (request, response) => {
  response.send('Hello World')
})

// Activate webserver by calling .listen(port, callback);
webserver.listen(5002)
  .then((socket) => console.log('Webserver started on port 5002'))
  .catch((error) => console.log('Failed to start webserver on port 5002'))
