# Documentation

# Examples

#### 'Hello World' application
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

#### Multipart

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

## CORS

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