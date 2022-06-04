// eslint-disable-next-line no-unused-vars
const { Readable, Writable } = require('readable-stream')
// eslint-disable-next-line no-unused-vars
const Server = require('./Server.js') // lgtm [js/unused-local-variable]
const cookie = require('./helpers/cookie')
const signature = require('./helpers/cookie-signature')
const statusCodes = require('./statusCodes.json')
const mimeTypes = require('./helpers/mime-types')
const { fastArrayJoin } = require('./utils')

const SSEventStream = require('./SSEventStream')

class Response extends Writable {
  constructor (wrappedRequest, rawResponse, route) {
    // Initialize the writable stream for this response
    super()

    // Store the provided parameter properties for later use
    this.wrapped_request = wrappedRequest
    this.raw_response = rawResponse
    this.master_context = route.app
    this.app_options = route.app._options
    this.route_options = route.options

    // Bind the abort handler as required by uWebsockets.js
    this._bind_abort_handler()

    // Bind a finish/close handler which will end the response once writable has closed
    super.once('finish', () => (this.streaming ? this.send() : undefined))
  }

  /**
     * @private
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method binds an abort handler which will update completed field to lock appropriate operations in Response
     */
  _bind_abort_handler () {
    this.raw_response.onAborted(() => {
      this.completed = true
      this.wrapped_request._stop_streaming()
      this.emit('abort', this.wrapped_request, this)
      this.emit('close', this.wrapped_request, this)
    })
  }

  /**
     * Tracks middleware cursor position over a request's lifetime.
     * This is so we can detect any double middleware iterations and throw an error.
     * @private
     * @param {Number} position - Cursor position
     */
  _track_middleware_cursor (position) {
    // Initialize cursor on first invocation
    if (this.middleware_cursor === undefined) return (this.middleware_cursor = position)

    // Check if position is greater than last cursor and update
    if (position > this.middleware_cursor) return (this.middleware_cursor = position)

    // If position is not greater than last cursor then we likely have a double middleware execution
    this.throw(
      new Error(
        'Double middleware execution detected! You have a bug where one of your middlewares is calling both the next() callback and also resolving from a Promise/async middleware. You must only use one of these not both.'
      )
    )
  }

  /**
     * Resume the associated request if it is paused.
     * @private
     */
  _resume_if_paused () {
    // Unpause the request if it is paused
    if (this.wrapped_request.paused) this.wrapped_request.resume()
  }

  /* Response Methods/Operators */

  /**
     * This method can be used to improve Network IO performance by executing
     * all network operations in a singular atomic structure.
     *
     * @param {Function} handler
     */
  atomic (handler) {
    if (typeof handler !== 'function') this.throw(new Error('atomic(handler) -> handler must be a Javascript function'))

    this._resume_if_paused()

    return this.raw_response.cork(handler)
  }

  /**
     * This method is used to set a custom response code.
     *
     * @param {Number} code Example: response.status(403)
     * @returns {Response} Response (Chainable)
     */
  status (code) {
    // Throw expection if a status change is attempted after response has been initiated
    if (this.initiated) {
      this.throw(
        new Error(
          'Response.status(code) -> HTTP Status Code cannot be changed once a response has been initiated.'
        )
      )
    }

    // Set the numeric status code. Status text is appended before writing status to uws
    this.status_code = code
    return this
  }

  /**
     * This method is used to set the response content type header based on the provided mime type. Example: type('json')
     *
     * @param {String} mimeType Mime type
     * @returns {Response} Response (Chainable)
     */
  type (mimeType) {
    // Remove leading dot from mime type if present
    if (mimeType.startsWith('.')) mimeType = mimeType.substring(1)

    // Determine proper mime type and send response
    const mimeHeader = mimeTypes.lookup(mimeType) || 'text/plain'
    if (!this.completed) {
      this.type_written = true
      this.header('Content-Type', mimeHeader)
    }
    return this
  }

  /**
     * This method can be used to write a response header and supports chaining.
     *
     * @param {String} name Header Name
     * @param {String|Array<String>} value Header Value
     * @returns {Response} Response (Chainable)
     */
  header (name, value) {
    // Throw expection if a header write is attempted after response has been initiated
    if (this.initiated) {
      this.throw(
        new Error(
          'Response.header(name, value) -> Headers cannot be written after a response has already been initiated.'
        )
      )
    }

    // Call self for all specified values in values array
    if (Array.isArray(value)) {
      const length = value.length
      for (let i = 0; i < length; i++) {
        this.header(name, value[i])
      }
      return this
    }

    // Initialize headers container object if it does not exist
    if (this.headers === undefined) this.headers = new Map()

    // Initialize header values as an array to allow for multiple values
    if (this.headers.get(name) === undefined) this.headers.set(name, [])

    // Ensure that the value is always a string type
    if (typeof value !== 'string') {
      this.throw(
        new Error('header(name, value) -> value candidates must always be of type string')
      )
    }

    if (name.toLocaleLowerCase() === 'content-length') this.hasContentLength = true

    // Push current header value onto values array
    this.headers.get(name).push(value)
    return this
  }

  /**
     * @typedef {Object} CookieOptions
     * @property {String} domain
     * @property {String} path
     * @property {Number} maxAge
     * @property {Boolean} secure
     * @property {Boolean} httpOnly
     * @property {Boolean|'none'|'lax'|'strict'} sameSite
     * @property {String} secret
     */

  /**
     * This method is used to write a cookie to incoming request.
     * To delete a cookie, set the value to null.
     *
     * @param {String} name Cookie Name
     * @param {String} value Cookie Value
     * @param {Number} expiry In milliseconds
     * @param {CookieOptions} options Cookie Options
     * @param {Boolean} signCookie Enables/Disables Cookie Signing
     * @returns {Response} Response (Chainable)
     */
  cookie (
    name,
    value,
    expiry,
    options = {
      secure: true,
      sameSite: 'none',
      path: '/'
    },
    signCookie = true
  ) {
    // Determine if this is a delete operation and recursively call self with appropriate options
    if (name && value === null) {
      return this.cookie(name, '', null, {
        maxAge: 0
      })
    }

    // Convert expiry to a valid Date object or delete expiry altogether
    if (typeof expiry === 'number') options.expires = new Date(Date.now() + expiry)

    // Sign cookie value if signing is enabled and a valid secret is provided
    if (signCookie && typeof options.secret === 'string') {
      options.encode = false // Turn off encoding to prevent loss of signature structure
      value = signature.sign(value, options.secret)
    }

    // Initialize cookies holder and store cookie value
    if (this.cookies === undefined) this.cookies = {}
    this.cookies[name] = value

    // Serialize the cookie options and write the 'Set-Cookie' header
    return this.header('set-cookie', cookie.serialize(name, value, options))
  }

  /**
     * @private
     * Initiates response process by writing HTTP status code and then writing the appropriate headers.
     */
  _initiate_response () {
    // Ensure response can only be initiated once to prevent multiple invocations
    if (this.initiated || this.completed) return

    // Emit the 'prepare' event to allow for any last minute response modifications
    this.emit('prepare', this.wrapped_request, this)

    // Mark the instance as initiated signifying that no more status/header based operations can be performed
    this.initiated = true

    // Ensure we are not in a paused state as uWS requires us to be a in a flowing state to be able to write status and headers
    this._resume_if_paused()

    this.raw_response.cork(() => {
      // Write the appropriate status code to the response along with mapped status code message
      if (this.status_code) this.raw_response.writeStatus(statusCodes[this.status_code])

      // Iterate through all headers and write them to uWS
      if (this.headers) {
        this.headers.forEach((value, name) => {
          const length = value.length
          for (let i = 0; i < length; i++) {
            this.raw_response.writeHeader(name, value[i])
          }
        })
      }
    })
  }

  /**
     * Writes the provided chunk to the client over uWS with backpressure handling if a callback is provided.
     *
     * @private
     * @param {String|Buffer|ArrayBuffer} chunk
     * @param {String=} encoding
     * @param {Function=} callback
     * @returns {Boolean} 'false' signifies that the chunk was not sent due to built up backpressure.
     */
  _write (chunk, encoding, callback) {
    // Ensure the client is still connected and request is pending
    if (!this.completed) {
      // Mark this response as streaming
      this.streaming = true

      // Ensure response has been initiated before writing any chunks
      this._initiate_response()

      // Attempt to write the chunk to the client
      if (this.raw_response.write(chunk)) {
        // If chunk write was a success, we can move onto consuming the next chunk
        if (callback) callback()

        // Return true here to signify that this chunk was written successfully
        return true
      } else if (callback) {
        // Wait for this chunk to be written to the client
        let drained = false
        return this.drain(() => {
          // Call the callback once the chunk is drained
          if (!drained) {
            drained = true
            callback()
          }

          // Return true here to signify that this chunk was written successfully to uWS
          return drained
        })
      }
    }

    // Trigger callback with an error if a write() is performed after response has completed
    if (callback) callback(new Error('Response is already completed/aborted'))

    return false
  }

  /**
     * Writes multiples chunks for the response to the client over uWS with backpressure handling if a callback is provided.
     *
     * @private
     * @param {Array<Buffer>} chunks
     * @param {Function} callback
     */
  _writev (chunks, callback) {
    // Serve the first chunk in the array
    this._write(chunks[0], null, (error) => {
      // Pass the error to the callback if one was provided
      if (error) return callback(error)

      // Determine if we have more chunks after the first chunk we just served
      if (chunks.length > 1) {
        // Recursively serve the remaining chunks
        this._writev(chunks.slice(1), callback)
      } else {
        // Trigger the callback as all chunks have been served
        callback()
      }
    })
  }

  /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer=} body Optional
     * @param {Boolean=} closeConnection
     * @returns {Response} 'false' signifies that the body was not sent due to built up backpressure or closed connection.
     */
  send (body, closeConnection) {
    // Ensure response connection is still active
    if (!this.completed) {
      // Initiate response to write status code and headers
      this._initiate_response()

      // Stop downloading further body chunks as we are done with the response
      this.wrapped_request._stop_streaming()

      // Attempt to write the body to the client and end the response
      if (!this.streaming && !body) {
        // Add Content-Length for all status codes where body is optional
        if (!this.hasContentLength && this.wrapped_request.method !== 'HEAD') {
          this.raw_response.writeHeader('Content-Length', '0')
        }
        // Send the response with the uWS.HttpResponse.endWithoutBody(length, close_connection) method as we have no body data
        // NOTE: This method is completely undocumented by uWS but exists in the source code to solve the problem of no body being sent with a custom content-length
        this.raw_response.endWithoutBody()
      } else {
        // Send the response with the uWS.HttpResponse.end(body, close_connection) method as we have some body data
        this.raw_response.end(body, closeConnection)
      }

      // Emit the 'finish' event to signify that the response has been sent without streaming
      if (!this.streaming) this.emit('finish', this.wrapped_request, this)

      // Call any bound hooks for type 'complete' if no backpressure was built up
      if (!this.completed) {
        // Mark request as completed if we were able to send response properly
        this.completed = true
        // Emit the 'close' event to signify that the response has been completed
        this.emit('close', this.wrapped_request, this)
      }
    }

    return this
  }

  /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     * You MUST return a boolean value indicating if the write was successful or not.
     *
     * @param {function(number):boolean} handler Synchronous callback only
     */
  drain (handler) {
    // Ensure handler is a function type
    if (typeof handler !== 'function') {
      this.throw(new Error('Response.drain(handler) -> handler must be a Function.'))
    }

    // Bind a writable handler with a fallback return value to true as uWS expects a Boolean
    this.raw_response.onWritable((offset) => {
      // Retrieve the write result from the handler
      const output = handler(offset)

      // Throw an exception if the handler did not return a boolean value as that is an improper implementation
      if (typeof output !== 'boolean') {
        this.throw(
          new Error(
            'Response.drain(handler) -> handler must return a boolean value stating if the write was successful or not.'
          )
        )
      }

      // Return the boolean value to uWS as required by uWS documentation
      return output
    })
  }

  /**
     * @private
     * Streams individual chunk from a stream.
     * Delivers with chunked transfer without content-length header when no total_size is specified.
     * Delivers with backpressure handling and content-length header when a total_size is specified.
     *
     * @param {Readable} stream
     * @param {Buffer} chunk
     * @param {Number=} totalSize
     */
  _stream_chunk (stream, chunk, totalSize) {
    // Ensure the client is still connected and request is pending
    if (!this.completed) {
      // Attempt to stream the chunk using appropriate uWS.Response chunk serving method
      // This will depend on whether a total_size is specified or not
      let sent, finished
      // const lastOffset = this.write_offset
      if (totalSize) {
        // Attempt to stream the current chunk using uWS.tryEnd with a total size
        const [ok, done] = this.raw_response.tryEnd(chunk, totalSize)
        sent = ok
        finished = done
      } else {
        // Attempt to stream the current chunk uWS.write()
        sent = this.raw_response.write(chunk)

        // Since we are streaming without a total size, we are not finished
        finished = false
      }

      if (finished) {
        // If streaming has finished, we can destroy the readable stream just to be safe
        if (!stream.destroyed) stream.destroy()
      } else if (!sent) {
        // Pause the readable stream to prevent any further data from being read
        stream.pause()

        // Bind a drain handler which will resume the once the backpressure is cleared
        this.drain(() => {
          // Resume the stream if it is paused
          if (stream.isPaused()) stream.resume()

          // Return the write boolean to uWS based on whether the stream is active or not
          return !stream.isPaused()
        })
      }
    }
  }

  /**
     * This method is used to serve a readable stream as response body and send response.
     * By default, this method will use chunked encoding transfer to stream data.
     * If your use-case requires a content-length header, you must specify the total payload size.
     *
     * @param {Readable} readable A Readable stream which will be consumed as response body
     * @param {Number=} totalSize Total size of the Readable stream source in bytes (Optional)
     */
  stream (readable, totalSize) {
    // Ensure readable is an instance of a stream.Readable
    if (typeof readable !== 'object' && typeof readable.destroy !== 'function') {
      this.throw(
        new Error('Response.stream(readable, totalSize) -> readable must be a Readable stream.')
      )
    }

    // Do not allow streaming if response has already been aborted or completed
    if (!this.completed) {
      // Bind an 'abort' event handler which will destroy the consumed stream if request is aborted
      this.on('abort', () => {
        if (!readable.destroyed) readable.destroy()
      })

      // Initiate response as we will begin writing body chunks
      this._initiate_response()

      // Bind a listener for the 'data' event to consume chunks
      readable.on('data', (chunk) => this._stream_chunk(readable, chunk, totalSize))

      // Bind listeners to end request on stream closure if no total size was specified and thus we delivered with chunked transfer
      if (!totalSize) {
        const endRequest = () => this.send()
        readable.once('end', endRequest)
      }
    }
  }

  /**
     * Instantly aborts/closes current request without writing a status response code.
     * Use this only in extreme situations to abort a request where a proper response is not neccessary.
     */
  close () {
    if (!this.completed) {
      this.completed = true
      this._resume_if_paused()
      this.wrapped_request._stop_streaming()
      this.raw_response.close()
    }
  }

  /**
     * This method is used to redirect an incoming request to a different url.
     *
     * @param {String} url Redirect URL
     * @param {Number=} code Status code (301 or 302)
     * @returns {Boolean} Boolean
     */
  redirect (url, code = 302) {
    if (!this.completed) return this.status(code).header('Location', url).send()
    return false
  }

  /**
     * This method is an alias of send() method except it accepts an object and automatically stringifies the passed payload object.
     *
     * @param {Object} body JSON body
     * @returns {Boolean} Boolean
     */
  json (body) {
    if (this.route_options.JSONSerializer) {
      body = this.route_options.JSONSerializer(body)
    } else {
      try {
        body = JSON.stringify(body)
      } catch (ex) {}
    }

    if (!body) body = '{}'

    return this.type('json').send(body)
  }

  /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object with a callback name.
     * Note! This method uses 'callback' query parameter by default but you can specify 'name' to use something else.
     *
     * @param {Object} body
     * @param {String=} name
     * @returns {Boolean} Boolean
     */
  jsonp (body, name) {
    const queryParameters = this.wrapped_request.query_parameters
    const methodName = queryParameters.callback || name
    return this.type('js').send(`${methodName}(${JSON.stringify(body)})`)
  }

  /**
     * This method is an alias of send() method except it automatically sets
     * html as the response content type and sends provided html response body.
     *
     * @param {String} body
     * @returns {Boolean} Boolean
     */
  html (body) {
    return this.type('html').send(body)
  }

  /**
     * Writes approriate headers to signify that file at path has been attached.
     *
     * @param {String} path
     * @param {String=} name
     * @returns {Response}
     */
  attachment (path, name) {
    // Attach a blank content-disposition header when no filename is defined
    if (path === undefined) return this.header('Content-Disposition', 'attachment')

    // Parses path in to file name and extension to write appropriate attachment headers
    const chunks = path.split('/')
    const finalName = name || chunks[chunks.length - 1]
    const nameChunks = finalName.split('.')
    const extension = nameChunks[nameChunks.length - 1]
    return this.header('Content-Disposition', `attachment; filename="${finalName}"`).type(extension)
  }

  /**
     * Writes appropriate attachment headers and sends file content for download on user browser.
     * This method combined Response.attachment() and Response.file() under the hood, so be sure to follow the same guidelines for usage.
     *
     * @param {String} path
     * @param {String=} filename
     */
  download (path, filename) {
    return this.attachment(path, filename).file(path)
  }

  /**
     * This method allows you to throw an error which will be caught by the global error handler (If one was setup with the Server instance).
     *
     * @param {Error} error
     */
  throw (error) {
    // Ensure error is an instance of Error
    if (typeof error === 'object' && typeof error.message === 'string') return this.master_context.handlers.get('on_error')(this.wrapped_request, this, error)

    // If error is not an instance of Error, throw a warning error
    throw new Error('Response.throw() expects an instance of an Error.')
  }

  /* Response Getters */

  /**
     * Returns the underlying raw uWS.Response object.
     * @returns {uWebsockets.Response}
     */
  get raw () {
    return this.raw_response
  }

  /**
     * Returns current state of request in regards to whether the source is still connected.
     * @returns {Boolean}
     */
  get aborted () {
    return this.completed
  }

  /**
     * Returns a "Server-Sent Events" connection object to allow for SSE functionality.
     * This property will only be available for GET requests as per the SSE specification.
     *
     * @returns {SSEventStream=}
     */
  get sse () {
    // Return a new SSE instance if one has not been created yet
    if (this.wrapped_request.method === 'GET') {
      // Create new SSE instance if one has not been created yet
      if (this._sse === undefined) this._sse = new SSEventStream(this)
      return this._sse
    }
  }

  /**
     * Returns the current response body content write offset in bytes.
     * Use in conjunction with the drain() offset handler to retry writing failed chunks.
     * @returns {Number}
     */
  get write_offset () {
    return this.completed ? -1 : this.raw_response.getWriteOffset()
  }

  /* ExpressJS compatibility properties & methods */

  /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invocated.
     * @private
     * @param {String} name
     */
  _throw_unsupported (name) {
    this.throw(
      new Error(`One of your middlewares or logic tried to call Response.${name} which is unsupported.`)
    )
  }

  /**
     * ExpressJS: Alias of Response.completed
     */
  get headersSent () {
    return this.completed
  }

  /**
     * ExpressJS: Alias of Response.status_code to expose response status code
     */
  get statusCode () {
    return this.completed ? this.status_code : undefined
  }

  /**
     * ExpressJS: Alias of Response.status_code to expose setter response status code
     */
  set statusCode (code) {
    this.status(code)
  }

  /**
     * ExpressJS: Alias of header() method
     * @param {String} name
     * @param {String|Array} values
     */
  append (name, values) {
    return this.header(name, values)
  }

  /**
     * ExpressJS: Alias of Response.append()
     */
  setHeader (name, values) {
    return this.append(name, values)
  }

  /**
     * ExpressJS: Writes multiple headers in form of an object
     * @param {Object} headers
     */
  writeHeaders (headers) {
    for (const name in headers) {
      this.header(name, headers[name])
    }
  }

  /**
     * ExpressJS: Alias of Response.writeHeaders
     * @param {Object} headers
     */
  setHeaders (headers) {
    this.writeHeaders(headers)
  }

  /**
     * ExpressJS: Writes multiple header values for a single name
     * @param {String} name
     * @param {Array} values
     */
  writeHeaderValues (name, values) {
    const length = values.length
    for (let i = 0; i < length; i++) {
      this.header(name, values[i])
    }
  }

  /**
     * ExpressJS: Returns pending header from this response
     * @param {String} name
     * @returns {String|Array|undefined}
     */
  getHeader (name) {
    return this.headers.get(name)
  }

  /**
     * ExpressJS: Returns all pending headers from this response
     * @returns {Object|undefined}
     */
  getHeaders () {
    const headers = {}

    this.headers.forEach((value, name) => {
      headers[name] = fastArrayJoin(value, ',')
    })

    return headers
  }

  /**
     * ExpressJS: Removes header from this response
     * @param {String} name
     */
  removeHeader (name) {
    this.headers.delete(name)
  }

  /**
     * ExpressJS: Alias of Response.cookie()
     * @param {String} name
     * @param {String} value
     * @param {Object} options
     */
  setCookie (name, value, options) {
    return this.cookie(name, value, null, options)
  }

  /**
     * ExpressJS: checks if a cookie exists
     * @param {String} name
     * @returns {Boolean}
     */
  hasCookie (name) {
    return this.cookies && this.cookies[name] !== undefined
  }

  /**
     * ExpressJS: Alias of Response.cookie(name, null) method.
     * @param {String} name
     */
  removeCookie (name) {
    return this.cookie(name, null)
  }

  /**
     * ExpressJS: Alias of Response.cookie(name, null) method.
     * @param {String} name
     */
  clearCookie (name) {
    return this.cookie(name, null)
  }

  /**
     * ExpressJS: Alias of Response.send()
     */
  end (data) {
    return this.send(data)
  }

  /**
     * Unsupported method
     */
  format () {
    this._throw_unsupported('format()')
  }

  /**
     * ExpressJS: Returns the HTTP response header specified by field. The match is case-insensitive.
     * @param {String} name
     * @returns {String|Array}
     */
  get (name) {
    return this.headers.get(name)
  }

  /**
     * ExpressJS: Joins the links provided as properties of the parameter to populate the response’s Link HTTP header field.
     * @param {Object} links
     * @returns {String}
     */
  links (links) {
    if (typeof links !== 'object' || links == null) { this.throw(new Error('Response.links(links) -> links must be an Object')) }

    // Build chunks of links and combine into header spec
    const chunks = []
    for (const rel in links) {
      chunks.push(`<${links[rel]}>; rel="${rel}"`)
    }

    return fastArrayJoin(chunks, ', ')
  }

  /**
     * ExpressJS: Sets the response Location HTTP header to the specified path parameter.
     * @param {String} path
     */
  location (path) {
    return this.header('location', path)
  }

  /**
     * Unsupported method
     */
  render () {
    this._throw_unsupported('render()')
  }

  /**
     * ExpressJS: Alias of Response.file()
     * @param {String} path
     */
  sendFile (path) {
    return this.file(path)
  }

  /**
     * ExpressJS: Alias of Response.status()
     * @param {Number} statusCode
     */
  sendStatus (statusCode) {
    return this.status(statusCode)
  }

  /**
     * ExpressJS: Sets the response’s HTTP header field to value. To set multiple fields at once, pass an object as the parameter.
     * @param {String|Object} object
     * @param {(String|Array)=} value
     */
  set (field, value) {
    if (typeof field === 'object') {
      for (const name in field) {
        this.header(field, field[name])
      }
    } else {
      this.header(field, value)
    }
  }

  /**
     * ExpressJS: Adds the field to the Vary response header, if it is not there already.
     * @param {String} name
     */
  vary (name) {
    return this.header('Vary', name)
  }
}

module.exports = Response
