// eslint-disable-next-line no-unused-vars
const { Readable, Writable, WritableOptions } = require('readable-stream')
const cookie = require('./helpers/cookie')
const signature = require('./helpers/cookie-signature')
const busboy = require('./helpers/busboy')
const MultipartField = require('./MultipartField')
const CustomError = require('./CustomError')
const { getIP } = require('./utils')

// ExpressJS compatibility packages
const accepts = require('./helpers/accepts')
const parseRange = require('./helpers/range-parser')
const typeIs = require('./helpers/type-is')
const isIP = require('net').isIP

class Request extends Readable {
  constructor (rawRequest, rawResponse, route) {
    // Initialize the request readable stream for body consumption
    super()

    // Pre-parse core data attached to volatile uWebsockets request/response objects
    this.raw_request = rawRequest
    this.raw_response = rawResponse
    this.app_options = route.app._options

    this.locals = {}

    // IMPORTANT TO GET ALL THE DATA!
    this.method = this.raw_request.getMethod().toUpperCase()
    this.path = this.raw_request.getUrl()
    this._remote_ip = this.raw_response.getRemoteAddress()
    this._remote_proxy_ip = this.raw_response.getProxiedRemoteAddress()

    route.requestDecorators.forEach((decorator, name) => (this[name] = decorator))

    this.headers = new Map()
    this.path_parameters = new Map()

    this.raw_request.forEach((key, value) => (this.headers.set(key, value)))

    const contentLength = Number(this.headers.get('content-length'))
    this.contentLength = Number.isNaN(contentLength) ? 0 : contentLength

    // Parse path parameters from request path if we have a path parameters parsing key
    if (route.path_parameters_key.length !== 0) this._parse_path_parameters(route.path_parameters_key)
  }

  /**
     * This method parses path parameters from incoming request using a parameter key
     * @private
     * @param {Array} parameters_key [[key, index], ...]
     */
  _parse_path_parameters (parametersKey) {
    // Iterate over each expected path parameter key value pair and parse the value from uWS.HttpRequest.getParameter()
    const paramsLength = parametersKey.length
    for (let i = 0; i < paramsLength; i++) {
      const value = this.raw_request.getParameter(parametersKey[i][1])
      if (!this.path_parameters[parametersKey[i][0]]) {
        this.path_parameters.set(parametersKey[i][0], value)
      } else if (typeof this.path_parameters[parametersKey[i][0]] === 'string') {
        this.path_parameters.set(parametersKey[i][0], [this.path_parameters[parametersKey[i][0]], value])
      } else if (Array.isArray(this.path_parameters[parametersKey[i][0]])) {
        this.path_parameters.get(parametersKey[i][0]).push(value)
      }
    }
  }

  /* Request Methods/Operators */

  /**
     * Pauses the current request and flow of incoming body data.
     * @returns {Request}
     */
  pause () {
    // Ensure request is not already paused before pausing
    if (!super.isPaused()) {
      this.raw_response.pause()
      return super.pause()
    }
    return this
  }

  /**
     * Resumes the current request and flow of incoming body data.
     * @returns {Request}
     */
  resume () {
    // Ensure request is paused before resuming
    if (super.isPaused()) {
      this.raw_response.resume()
      return super.resume()
    }
    return this
  }

  /**
     * Pipes the request body stream data to the provided destination stream with the provided set of options.
     *
     * @param {Writable} destination
     * @param {WritableOptions} options
     * @returns {Request}
     */
  pipe (destination, options) {
    // Pipe the arguments to the request body stream
    super.pipe(destination, options)

    // Resume the request body stream as it will be in a paused state by default
    return super.resume()
  }

  /**
     * Securely signs a value with provided secret and returns the signed value.
     *
     * @param {String} string
     * @param {String} secret
     * @returns {String} String OR undefined
     */
  sign (string, secret) {
    return signature.sign(string, secret)
  }

  /**
     * Securely unsigns a value with provided secret and returns its original value upon successful verification.
     *
     * @param {String} signedValue
     * @param {String} secret
     * @returns {String=} String OR undefined
     */
  unsign (signedValue, secret) {
    const unsignedValue = signature.unsign(signedValue, secret)
    if (unsignedValue !== false) return unsignedValue
  }

  /**
     * Begins streaming incoming body data in chunks received.
     *
     * @private
     */
  _start_streaming () {
    // Bind a read handler for resuming stream consumption
    this._read = () => this.resume()

    // Bind a uWS.Response.onData() handler which will handle incoming chunks and pipe them to the readable stream
    let buffer
    this.raw_response.onData((arrayBuffer, isLast) => {
      // Do not process chunk if the readable stream is no longer active
      if (this.stream_ended || this.readableEnded || this.readableAborted) return

      // Convert the ArrayBuffer to a Buffer reference
      // Provide raw chunks if specified and we have something consuming stream already
      // This will prevent unneccessary duplication of buffers
      if (this.listenerCount('data') !== 0 && this.stream_raw_chunks) {
        // Store a direct Buffer reference as this will be immediately consumed
        buffer = Buffer.from(arrayBuffer)
      } else {
        // Store a copy of the array_buffer as we have no immediate consumer yet
        // If we do not copy, this chunk will be lost in stream queue as it will be deallocated by uWebSockets
        buffer = Buffer.concat([Buffer.from(arrayBuffer)])
      }

      // Push the incoming chunk into readable stream for consumption
      // Pause the uWS request if our stream is backed up
      if (!this.push(buffer)) this.pause()

      // Push a null chunk signaling an EOF to the stream to end it if this chunk is last
      if (isLast) this.push(null)
    })
  }

  /**
     * Halts the streaming of incoming body data for this request.
     * @private
     */
  _stop_streaming () {
    // Push an EOF chunk to the body stream signifying the end of the stream
    if (!this.readableEnded) this.push(null)

    // Mark the stream as ended so all incoming chunks will be ignored from uWS.HttpResponse.onData() handler
    this.stream_ended = true
  }

  /**
     * Initiates body buffer download process by consuming the request readable stream.
     *
     * @private
     * @returns {Promise}
     */
  _download_buffer () {
    // Return pending buffer promise if in flight
    if (this.buffer_promise) return this.buffer_promise

    // Resolve an empty buffer instantly if we have no readable body stream
    if (this.readableEnded) return (this.body_buffer = Buffer.from(''))

    // Mark this instance to provide raw buffers through readable stream
    this.stream_raw_chunks = true

    // Initiate a buffer promise with chunk retrieval process
    this.buffer_promise = new Promise((resolve) => {
      // Store promise resolve method to allow closure from _abort_buffer() method
      // this.buffer_resolve = resolve

      // Allocate an empty body buffer to store all incoming chunks depending on buffering scheme
      const body = {
        cursor: 0,
        buffer: Buffer[this.app_options.get('unsafe_buffers') ? 'allocUnsafe' : 'alloc'](this.contentLength)
      }

      // Drain any previously buffered data from the readable request stream
      if (this.readableLength > 0) {
        // Copy the buffered chunk from stream into our body buffer
        const chunk = this.read(this.readableLength)
        chunk.copy(body.buffer, body.cursor, 0, chunk.byteLength)

        // Increment the cursor by the byteLength to remember our write position
        body.cursor += chunk.byteLength
      }

      // Resolve our body buffer if we have no more future chunks to read
      if (this.readableEnded) return resolve(body.buffer)

      // Begin consuming future chunks from the readable request stream
      this.on('data', (chunk) => {
        // Copy the temporary chunk from uWS into our body buffer
        chunk.copy(body.buffer, body.cursor, 0, chunk.byteLength)

        // Increment the cursor by the byteLength to remember our write position
        body.cursor += chunk.byteLength
      })

      // Resolve the body buffer once the readable stream has finished
      this.once('end', () => resolve(body.buffer))

      // We must directly resume the readable stream to make it begin accepting data
      // IMPORTANT!
      super.resume()
    })

    // Bind a then handler for caching the downloaded buffer

    return (this.body_buffer = this.buffer_promise)
  }

  /**
     * Downloads and returns request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
  buffer () {
    // Check cache and return if body has already been parsed
    if (this.body_buffer) return this.body_buffer

    // Resolve empty if invalid content-length header detected
    if (!this.contentLength || this.contentLength < 1) return (this.body_buffer = Buffer.from(''))

    // Initiate buffer download
    return this._download_buffer()
  }

  /**
     * Downloads and parses the request body as a String.
     * @returns {Promise<string>}
     */
  async text () {
    // Resolve from cache if available
    if (this.body_text) return this.body_text

    // Retrieve body buffer, convert to string, cache and resolve
    return (this.body_text = (this.body_buffer || (await this.buffer())).toString())
  }

  /**
     * Parses JSON from provided string.
     * Resolves default_value
     *
     * @private
     * @param {String} string
     * @param {Any} defaultValue
     * @returns {Any}
     */
  _parse_json (string, defaultValue) {
    if (this.JSONParse) {
      return this.JSONParse(string) || defaultValue
    } else {
      try {
        return JSON.parse(string)
      } catch (ex) {
        return defaultValue
      }
    }
  }

  /**
     * Downloads and parses the request body as a JSON object.
     * Passing default_value as undefined will lead to the function throwing an exception if invalid JSON is received.
     *
     * @param {Any} defaultValue Default: {}
     * @returns {Promise}
     */
  async json (defaultValue = {}) {
    // Return from cache if available
    if (this.body_json) return this.body_json

    // Retrieve body as text, safely parse json, cache and resolve
    const text = this.body_text || (await this.text())
    return (this.body_json = this._parse_json(text, defaultValue))
  }

  /**
     * Parses and resolves an Object of urlencoded values from body.
     * @returns {Promise}
     */
  async urlencoded () {
    // Return from cache if available
    if (this.body_urlencoded) return this.body_urlencoded

    // Retrieve text body, parse as a query string, cache and resolve
    return (this.body_urlencoded = new URLSearchParams(this.body_text || (await this.text())))
  }

  /**
     * Handles incoming multipart fields from uploader and calls user specified handler with MultipartField.
     *
     * @private
     * @param {Function} handler
     * @param {String} name
     * @param {String|stream.Readable} value
     * @param {Object} info
     */
  async _on_multipart_field (handler, name, value, info) {
    // Create a MultipartField instance with the incoming information
    const field = new MultipartField(name, value, info)

    // Wait for the previous multipart field handler promise to resolve
    if (typeof this.multipart_promise === 'object' && typeof this.multipart_promise.then === 'function') {
      // We will keep the request paused so we do not receive more chunks
      this.pause()
      await this.multipart_promise
      this.resume()
    }

    // Trigger the user specified handler with the multipart field
    const output = handler(field)

    // If the handler returns a Promise, store it locally
    // this promise can be used to pause the request when the next field is received but user is not ready yet
    if (typeof output === 'object' && typeof output.then === 'function') {
      // Store this promise locally so the next field can use it to wait
      this.multipart_promise = output

      // Hold the current execution until the user handler promise resolves
      await this.multipart_promise
      this.multipart_promise = null
    }

    // Flush this field's file stream if it has not been consumed by the user as stated in busboy docs
    if (field.file && !field.file.stream.readableEnded) field.file.stream.resume()
  }

  /**
     * @typedef {function(MultipartField):void} SyncMultipartHandler
     */

  /**
     * @typedef {function(MultipartField):Promise<void>} AsyncMultipartHandler
     */

  /**
     * Downloads and parses incoming body as a multipart form.
     * This allows for easy consumption of fields, values and files.
     *
     * @param {busboy.BusboyConfig|SyncMultipartHandler|AsyncMultipartHandler} options
     * @param {(SyncMultipartHandler|AsyncMultipartHandler)=} handler
     * @returns {Promise<CustomError|Error>} A promise which is resolved once all multipart fields have been processed
     */
  multipart (options, handler) {
    // Migrate options to handler if no options object is provided by user
    if (typeof options === 'function') {
      handler = options
      options = {}
    }

    // Inject the request headers into the busboy options
    options.headers = this.headers

    // Ensure the provided handler is a function type
    if (typeof handler !== 'function') throw new Error('Request.multipart(handler) -> handler must be a Function.')

    // Resolve instantly if we have no readable body stream
    if (this.readableEnded) return Promise.resolve()

    // Resolve instantly if we do not have a valid multipart content type header
    const contentType = this.headers.get('content-type')
    if (!/^(multipart\/.+);(.*)$/i.test(contentType)) return Promise.resolve()

    // Return a promise which will be resolved after all incoming multipart data has been processed
    return new Promise((resolve, reject) => {
      // Create a Busboy instance which will perform
      const uploader = busboy(options)

      // Bind an 'error' event handler to emit errors
      uploader.on('error', reject)

      // IMPORTANT!
      uploader.on('drain', () => this.resume())

      // Bind limit event handlers to reject as error code constants
      // eslint-disable-next-line prefer-promise-reject-errors
      uploader.on('partsLimit', () => reject(new CustomError('PARTS_LIMIT_REACHED', 413)))
      // eslint-disable-next-line prefer-promise-reject-errors
      uploader.on('filesLimit', () => reject(new CustomError('FILES_LIMIT_REACHED', 413)))
      // eslint-disable-next-line prefer-promise-reject-errors
      uploader.on('fieldsLimit', () => reject(new CustomError('FIELDS_LIMIT_REACHED', 413)))

      // Bind a 'field' event handler to process each incoming field
      uploader.on('field', (name, value, info) => this._on_multipart_field(handler, name, value, info))

      // Bind a 'file' event handler to process each incoming file
      uploader.on('file', (name, file, info) => this._on_multipart_field(handler, name, file, info))

      // Bind a 'close' event handler to resolve the upload promise
      uploader.on('close', () => {
        // Wait for any pending multipart handler promise to resolve before moving forward
        if (this.multipart_promise) {
          this.multipart_promise.then(resolve)
        } else {
          resolve()
        }
      })

      // Pipe the readable request stream into the busboy uploader
      try {
        this.pipe(uploader)
      } catch (ex) {
        reject(new Error('INTERNAL_ERROR'))
      }
    })
  }

  /* ExpressJS compatibility properties & methods */

  /**
     * ExpressJS: Returns header for specified name.
     * @param {String} name
     * @returns {String|undefined}
     */
  get (name) {
    const lowercase = name.toLowerCase()
    switch (lowercase) {
      case 'referer':
      case 'referrer':
        return this.headers.get('referer') || this.headers.get('referrer')
      default:
        return this.headers.get(lowercase)
    }
  }

  /**
     * ExpressJS: Alias of .get(name) method.
     * @param {String} name
     * @returns {String|undefined}
     */
  header (name) {
    return this.get(name)
  }

  /**
     * ExpressJS: Checks if provided types are accepted.
     * @param {String|Array} types
     * @returns {String|Array|Boolean}
     */
  accepts () {
    return this.accept.types(arguments)
  }

  /**
     * ExpressJS: Checks if provided encodings are accepted.
     * @param {String|Array} encodings
     * @returns {String|Array}
     */
  acceptsEncodings () {
    return this.accept.encodings(arguments)
  }

  /**
     * ExpressJS: Checks if provided charsets are accepted
     * @param {String|Array} charsets
     * @returns {String|Array}
     */
  acceptsCharsets () {
    return this.accept.charsets(arguments)
  }

  /**
     * ExpressJS: Checks if provided languages are accepted
     * @param {String|Array} languages
     * @returns {String|Array}
     */
  acceptsLanguages () {
    return this.accept.languages(arguments)
  }

  /**
     * ExpressJS: Parse Range header field, capping to the given `size`.
     * @param {Number} size
     * @param {Object} options
     * @param {Boolean} options.combine Default: false
     * @returns {Number|Array}
     */
  range (size, options) {
    const range = this.get('range')
    if (!range) return
    return parseRange(size, range, options)
  }

  /**
     * ExpressJS: Return the value of param `name` when present or `defaultValue`.
     * @param {String} name
     * @param {Any} default_value
     * @returns {String|Array}
     */
  param (name, defaultValue) {
    // Parse three dataset candidates

    // First check path parameters, (body?), and finally query_parameters
    if (this.path_parameters.has(name)) return this.path_parameters.get(name)
    // if (this.body[name] !== null) return this.body[name]
    if (this.query_parameters.has(name)) {
      const values = this.query_parameters.getAll(name)
      return values.length === 1 ? values[0] : values
    }

    return defaultValue
  }

  /**
     * ExpressJS: Check if the incoming request contains the "Content-Type" header field, and it's value equals the given mime `type`.
     * @param {String|Array} types
     * @returns {String|false|null}
     */
  is (types) {
    // support flattened arguments
    let arr = types
    if (!Array.isArray(types)) {
      arr = new Array(arguments.length)
      for (let i = 0; i < arr.length; i++) arr[i] = arguments[i]
    }
    return typeIs(this, arr)
  }

  /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invocated.
     * @private
     * @param {String} name
     */
  _throw_unsupported (name) {
    throw new Error(
      `One of your middlewares or logic tried to call Request.${name} which is unsupported.`
    )
  }

  /**
     * Returns underlying uWS.Request reference.
     * Note! Utilizing any of uWS.Request's methods after initial synchronous call will throw a forbidden access error.
     */
  get raw () {
    return this.raw_request
  }

  get url () {
    if (this._url) return this._url

    return (this._url = this.path + (this.query_parameters ? '?' + this.query_parameters.toString() : ''))
  }

  get accept () {
    if (this._accept) return this._accept

    return (this._accept = accepts(this))
  }

  /**
     * Returns whether this request is in a paused state and thus not consuming any body chunks.
     * @returns {Boolean}
     */
  get paused () {
    return this.isPaused()
  }

  /**
     * Returns request cookies from incoming request.
     * @returns {Record<string, string>}
     */
  get cookies () {
    // Return from cache if already parsed once
    if (this._cookies) return this._cookies

    // Parse cookies from Cookie header and cache results
    const cookies = this.headers.get('cookie')
    return (this._cookies = cookies ? cookie.parse(cookies) : {})
  }

  /**
     * Returns query parameters from incoming request.
     * @returns {URLSearchParams}
     */
  get query_parameters () {
    // Return from cache if already parsed once
    if (this._query_parameters) return this._query_parameters

    return (this._query_parameters = new URLSearchParams(this.raw_request.getQuery()))
  }

  /**
     * Returns remote IP address in string format from incoming request.
     * @returns {String}
     */
  get ip () {
    // Convert Remote IP to string on first access
    if (typeof this.remote_ip !== 'string') this.remote_ip = getIP(this._remote_ip)

    return this.remote_ip
  }

  /**
     * Returns remote proxy IP address in string format from incoming request.
     * @returns {String}
     */
  get proxy_ip () {
    // Convert Remote Proxy IP to string on first access
    if (typeof this.remote_proxy_ip !== 'string') this.remote_proxy_ip = getIP(this._remote_proxy_ip)

    return this.remote_proxy_ip
  }

  /**
     * ExpressJS: Alias of Request.path
     */
  get baseUrl () {
    return this.path
  }

  /**
     * ExpressJS: Alias of Request.url
     */
  get originalUrl () {
    return this.url
  }

  /**
   * @returns {Map} Returns Map object
   */
  get params () {
    return this.path_parameters
  }

  /**
     * Returns query parameters
     * @returns {URLSearchParams}
     */
  get query () {
    return this.query_parameters
  }

  /**
     * Unsupported property
     */
  get route () {
    this._throw_unsupported('route')
  }

  /**
     * ExpressJS: Returns the current protocol
     * @returns {('https'|'http')}
     */
  get protocol () {
    // Resolves x-forwarded-proto header if trust proxy is enabled
    const trustProxy = this.app_options.get('trust_proxy')
    const xForwardedProto = this.get('x-forwarded-proto')
    if (trustProxy && xForwardedProto) return xForwardedProto.indexOf(',') !== -1 ? xForwardedProto.split(',')[0] : xForwardedProto

    // Use uWS initially defined protocol
    return this.app_options.get('is_ssl') ? 'https' : 'http'
  }

  /**
     * ExpressJS: Returns true when request is on https protocol
     * @returns {Boolean}
     */
  get secure () {
    return this.protocol === 'https'
  }

  /**
     * ExpressJS: When "trust proxy" is set, trusted proxy addresses + client.
     * @returns {Array}
     */
  get ips () {
    const clientIP = this.ip
    const proxyIP = this.proxy_ip
    const trustProxy = this.app_options.get('trust_proxy')
    const xForwardedFor = this.get('x-forwarded-for')
    if (trustProxy && xForwardedFor) return xForwardedFor.split(',')

    return [clientIP, proxyIP]
  }

  /**
     * ExpressJS: Parse the "Host" header field to a hostname.
     */
  get hostname () {
    const trustProxy = this.app_options.get('trust_proxy')
    let host = this.get('x-forwarded-host')

    if (!host || !trustProxy) {
      host = this.get('host')
    } else if (host.indexOf(',') !== -1) {
      // Note: X-Forwarded-Host is normally only ever a
      //       single value, but this is to be safe.
      host = host.substring(0, host.indexOf(',')).trimEnd()
    }

    if (!host) return

    // IPv6 literal support
    const offset = host[0] === '[' ? host.indexOf(']') + 1 : 0
    const index = host.indexOf(':', offset)
    return index !== -1 ? host.substring(0, index) : host
  }

  /**
     * ExpressJS: Return subdomains as an array.
     * @returns {Array}
     */
  get subdomains () {
    if (!this.hostname) return []

    const offset = 2
    const subdomains = !isIP(this.hostname) ? this.hostname.split('.').reverse() : [this.hostname]
    return subdomains.slice(offset)
  }

  /**
     * Unsupported Property
     */
  get fresh () {
    this._throw_unsupported('fresh')
  }

  /**
     * Unsupported Property
     */
  get stale () {
    this._throw_unsupported('stale')
  }
}

module.exports = Request
