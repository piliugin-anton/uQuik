# Documentation

## Development
To see a thrown errors while you are developing your backend create a file `.env` in your project root, and place there `NODE_ENV="development"`

[Hello World](https://github.com/piliugin-anton/uQuik/tree/master/docs#hello-world)

[Multipart](https://github.com/piliugin-anton/uQuik/tree/master/docs#multipart)

[Cross-Origin Resource Sharing (CORS)](https://github.com/piliugin-anton/uQuik/tree/master/docs#cross-origin-resource-sharing-cors)

[JSON schema (JTD)](https://github.com/piliugin-anton/uQuik/tree/master/docs#json-schema-jtd)

[JSON WebToken (JWT)](https://github.com/piliugin-anton/uQuik/tree/master/docs#json-webtoken-jwt)

[Errors](https://github.com/piliugin-anton/uQuik/tree/master/docs#errors)

## Examples

#### Hello World
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
```javascript
const { Server } = require("uquik");

const uquik = new Server({
  json_errors: true,
});

const jwt = {
  secret: "test",
};

uquik.get("/protected", { jwt }, (request, response) => {
  // Authorized, sending the data
  response.send(`Hello ${request.locals.decodedToken.userId}`);
});

uquik.post("/login", { jwt }, (request, response) => {
  // Send user a token on successfull login
  response.json({ token: response.locals.token });
});

uquik.use("/protected", async (request, response, next) => {
  // Verify provided token (from Authorization header or cookies)
  try {
    request.locals.decodedToken = await request.jwtVerify();
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

#### Hello World Error
```javascript
const { Server, CustomError } = require("uquik");

const uquik = new Server();

uquik.get("/", (request, response) => {
  // Create a new CustomError(message, status_code)
  response.throw(new CustomError("Hello World!", 500));
});

uquik
  .listen(5000, "127.0.0.1")
  .then((socket) => console.log("[uQuik] Server started"))
  .catch((error) => console.log("[uQuik] Failed to start a server", error));

```