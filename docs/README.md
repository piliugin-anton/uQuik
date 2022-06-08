# Documentation

## Development
To see a thrown errors in console while you are developing your application create a file `.env` in your project root, and place there `NODE_ENV="development"`, see [`.env`](https://github.com/piliugin-anton/uQuik/blob/master/.env)

## Links
- [Hello World](https://github.com/piliugin-anton/uQuik/tree/master/docs#hello-world)

- [Routing](https://github.com/piliugin-anton/uQuik/tree/master/docs#routing)

- [Path parameters](https://github.com/piliugin-anton/uQuik/tree/master/docs#path-parameters)

- [Multipart](https://github.com/piliugin-anton/uQuik/tree/master/docs#multipart)

- [Cross-Origin Resource Sharing (CORS)](https://github.com/piliugin-anton/uQuik/tree/master/docs#cross-origin-resource-sharing-cors)

- [JSON schema (JTD)](https://github.com/piliugin-anton/uQuik/tree/master/docs#json-schema-jtd)

- [JSON WebToken (JWT)](https://github.com/piliugin-anton/uQuik/tree/master/docs#json-webtoken-jwt)

- [Errors](https://github.com/piliugin-anton/uQuik/tree/master/docs#errors)

- [Production](https://github.com/piliugin-anton/uQuik/tree/master/docs#production)

## Examples

#### Hello World
```javascript
const { Server } = require("uquik");

const uquik = new Server();

uquik.get("/", (request, response) => response.send("Hello World!"));

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[uQuik] Server started"))
  .catch((error) => console.log("[uQuik] Failed to start a server", error));

```

### Routing
```javascript
const { Server, Router } = require("uquik");

const uquik = new Server();

const apiRouter = new Router();
apiRouter.get("/", (request, response) => response.send("This is /api"));
apiRouter.get("/hello", (request, response) =>
  response.send("This is /api/hello")
);

const helloWorldRouter = new Router();
helloWorldRouter.get("/world", (request, response) =>
  response.send("This is /api/hello/world")
);

apiRouter.use("/hello", helloWorldRouter);

uquik.use("/api", apiRouter);

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));
```

#### Path parameters
```javascript
const { Server } = require("uquik");

const uquik = new Server();

uquik.get("/users/:userId", (request, response) => {
  response.send(`User ID: ${request.path_parameters.get("userId")}`);
});

uquik.get("/users/:userId/:method", (request, response) => {
  response.send(`User ID: ${request.path_parameters.get("userId")}, method: ${request.path_parameters.get("method")}`);
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));
```

### Multipart

```javascript
const { Server } = require("uquik");
const path = require("path");

const uquik = new Server({
  json_errors: true,
});

uquik.post("/upload", (request, response) => {
  // Here you can access the variables with information:
  // request.locals.uploadedFiles (for files)
  // request.locals.fields (for fields)
  console.log(request.locals.uploadedFiles);
  console.log(request.locals.fields);

  response.send("Upload complete!");
});

uquik.use("/upload", async (request, response, next) => {
  // Create variables to collect data
  request.locals.uploadedFiles = [];
  request.locals.fields = [];

  try {
    await request.multipart(async (field) => {
      // Ensure that this field is a file-type
      // You may also perform your own checks on the encoding and mime type as needed
      if (field.file) {
        const filePath = path.join(__dirname, "uploads", field.file.name);
        // Write file to disk
        await field.write(filePath);
        request.locals.uploadedFiles.push({
          originalName: field.file.name,
          filePath,
        });
      } else {
        request.locals.fields.push({
          fieldName: field.name,
          fieldValue: field.value,
        });
      }
    });
    next();
  } catch (error) {
    next(error);
  }
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));

```

### Cross-Origin Resource Sharing (CORS)

#### Available options for CORS [see here](https://github.com/expressjs/cors) 
#### Global CORS

```javascript
const { Server, CORS } = require("uquik");

const uquik = new Server();

uquik.use(CORS());

uquik.get("/", (request, response) => {
  response.send("Hello CORS World!");
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));
```

#### Route-specific CORS
```javascript
const { Server, CORS } = require("uquik");

const uquik = new Server();

uquik.get("/helloCORS", (request, response) => {
  response.send("Hello CORS World!");
});

uquik.use("/helloCORS", CORS());

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));

```

### JSON schema (JTD)

#### Available schema properties [see here](https://ajv.js.org/json-type-definition.html)
```javascript
const { Server } = require("uquik");

const uquik = new Server({
  json_errors: true,
});

const schema = {
  request: {
    properties: {
      bar: { type: "string" },
    },
  },
  response: {
    properties: {
      test: { type: "uint8" },
      foo: { type: "string" },
    },
    additionalProperties: false,
  },
};

uquik.post("/something", { schema }, (request, response) => {
  // Access request.locals.JSONRequest here
  console.log(request.locals.JSONRequest);

  const responseData = {
    test: 123,
    foo: "bar",
    test2: "sdfsdf",
  };

  response.json(responseData);
});

uquik.use("/something", async (request, response, next) => {
  request.locals.JSONRequest = await request.json();
  next();
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));

```

### JSON WebToken (JWT)

#### JWT options for route [see here](./Router.md)
#### Available options for jwtVerify() and jwtSign() [see here](https://github.com/nearform/fast-jwt)
```javascript
const { Server } = require("uquik");

const uquik = new Server({
  json_errors: true,
});

const jwt = {
  secret: "test",
  formatUser: (decodedToken) => decodedToken.userId,
};

uquik.get("/protected", { jwt }, (request, response) => {
  // Authorized, sending the data
  response.send(`Hello ${request.locals.userId}`);
});

uquik.post("/login", { jwt }, (request, response) => {
  // Send user a token on successfull login
  response.json({ token: response.locals.token });
});

uquik.use("/protected", async (request, response, next) => {
  // Verify provided token (from Authorization header or cookies)
  try {
    request.locals.userId = await request.jwtVerify();
    next();
  } catch (err) {
    next(err);
  }
});

uquik.use("/login", async (request, response, next) => {
  // Here you implement a logic for login (access db, get user ID, etc.)
  try {
    response.locals.token = await response.jwtSign(
      {
        userId: 12345,
      },
      {
        expiresIn: "1d",
      }
    );
    next();
  } catch (error) {
    next(error);
  }
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));
```

### Errors

#### Hello Error
```javascript
const { Server, CustomError } = require("uquik");

const uquik = new Server({
  json_errors: true // This will set to send errors in JSON format: {"error":"Hello Error!"}
});

uquik.get("/", (request, response) => {
  // Create a new CustomError(message, status_code)
  response.throw(new CustomError("Hello Error!", 500));
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[Example] Server started"))
  .catch((error) => console.log("[Example] Failed to start a server", error));

```

### Production
- Set `trust_proxy` option to `true` for `new Server()` instance

- #### Process manager (PM2)
  In production it's recommended to have a process manager that will automatically restart your application.
  I recommend you to use a [`PM2`](https://pm2.keymetrics.io/) as a process manager, install it by running: `npm install pm2@latest -g`
  Copy and modify to your needs a [PM2 configuration file (ecosystem.config.js)](./production/ecosystem.config.js)

  Run your application:
  ```
  pm2 start ecosystem.config.js
  ```
  **Note:** always run your application on 127.0.0.1 for security

  For more information about `PM2` [go here](https://pm2.keymetrics.io/docs/usage/process-management/)

- #### HTTP Proxy (Load balancer)
  Next step is to install an HTTP proxy(load balancer) [`nginx`](https://nginx.org/en/):

  For **Linux** [see this link](https://nginx.org/en/linux_packages.html)

  For **Windows** [see this link](https://nginx.org/en/download.html)

  `nginx` will handle http requests to both: **Frontend** (if any) and **Backend**. I recommend you to run your `uQuik` application in non-SSL mode and configure your SSL in `nginx` instead. Same goes for static files serving and compression.

  [Here is an example configuration for `nginx`](./production/nginx-example.conf)

  For more information about `nginx` [go here](https://nginx.org/en/docs/)