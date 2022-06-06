# Examples & Snippets
Below are various examples and snippets that make use of most components in HyperExpress.

#### Simple 'Hello World' application
```javascript
const { Server } = require("uquik");

const uquik = new Server();

uquik.get("/", (request, response) => {
  response.send("Hello World!");
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[uQuik] Server started"))
  .catch((error) => console.log("[uQuik] Failed to start a server", error));

```

#### Forbidden request scenario utilizing multiple response methods
```javascript
uquik.post('/api/v1/delete_user/:id', async (request, response) => {
   // Some bad stuff happened and this request is now forbidden
   
   // We multiple response network calls in atomic callback for best performance
   response
     .status(403) // Set the response HTTP status code
     .header('x-app-id', 'some-app-id') // Sets some random header
     .header('x-upstream-location', 'some_location') // Sets some random header
     .cookie('frontend_timeout', 'v1/delete_user', 1000 * 60 * 30, {
         secure: true,
         httpOnly: true
      }) // Sets some frontend cookie for enforcing front-end timeout
      .cookie('some_sess_id', null) // Deletes some session id cookie
      .type('html') // Sets content-type header according to 'html'
      .send(rendered_html) // Sends response with some rendered_html as the body
});
```

#### Streaming A Large Video File With A Readable Stream
```javascript
const fs = require('fs');

uquik.post('/assets/some_video.mkv', async (request, response) => {
   // Create a readable stream for the file
   const readable = fs.createReadStream('/path/to/some_video.mkv');

   // Handle any errors from the readable
   readable.on('error', (error) => some_logger(error));

   // Easily stream the video data to receiver
   response.stream(readable);
});
```

#### Streaming A Large Dataset With A Pipe To Response Writable
```javascript
const fs = require('fs');

uquik.post('/stream/some-data', async (request, response) => {
    // Get some readable stream which will retrieve our large dataset
    const readable = getReadableStreamForOurData();

    // Simply pipe the stream to the Response writable to serve it to the client
    readable.pipe(response);
});
```

#### Using Global & Route/Method Specific Middlewares
```javascript
// Assume webserver is a HyperExpress.Server instance

// Bind a global middleware that executes on all incoming requests
// These also execute before route/method specific middlewares as they are global
uquik.use((request, response, next) => {
    // Do some asynchronous stuff
    some_asynchronous_call((data) => {
        // you can assign values onto the request and response objects to be accessed later
        request.some_data = data;
        
        // We're all done, so let's move on
        next();
    });
});

const specific_middleware1 = (request, response, next) => {
    console.log('route specific middleware 1 ran!');
    return next();
};

const specific_middleware2 = (request, response, next) => {
    console.log('route specific middleware 2 ran!');
    return next();
};

// Bind a route/method specific middleware
// Middlewares are executed in the order they are specified in the middlewares Array
uquik.get('/', {
    middlewares: [specific_middleware1, specific_middleware2]
}, (request, response) => {
    // Handle your request as you normally would here
    return response.send('Hello World');
});
```