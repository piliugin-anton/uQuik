# uQuik
Highly performant HTTP(S) web-framework for Node.js
#### Powered by [`uWebSockets.js`](https://github.com/uNetworking/uWebSockets.js), based on [`Hyper-Express`](https://github.com/kartikk221/hyper-express)


#### Features:
- Simplified HTTP
- Global & Route-Specific Middlewares Support
- Modular Routers Support
- Server-Sent Events Support
- HTTP Streaming Support
- Performant Multipart File Uploading (using [`Busboy`](https://github.com/mscdex/busboy))
- Global Error/Event Handlers
- JSON schema validation (using [`Ajv`](https://ajv.js.org/json-type-definition.html))
- JSON Web Token (using [`fast-jwt`](https://github.com/nearform/fast-jwt))
- CORS support (using [`cors`](https://github.com/expressjs/cors))
- Cryptographically Secure Cookie Signing/Authentication
- ExpressJS API Compatibility (partial)

#### Requirements:
- Node.js version 14.15.0 or higher

## Usage:

#### Installation:
`npm install uquik`
#### Code:
````javascript
const { Server } = require("uquik");

const uquik = new Server();

uquik.get("/", (request, response) => {
  response.send("Hello World!");
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[uQuik] Server started"))
  .catch((error) => console.log("[uQuik] Failed to start a server", error));

````
## [`Documentation`](https://github.com/piliugin-anton/uQuik/docs)


## License
[MIT](./LICENSE)