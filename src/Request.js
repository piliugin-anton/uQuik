// eslint-disable-next-line no-unused-vars
const Server = require('./Server.js') // lgtm [js/unused-local-variable]
const cookie = require('./helpers/cookie')
const signature = require('./helpers/cookie-signature')
const qsParse = require('./helpers/qs.parse')
const { Readable } = require('readable-stream')
const busboy = require('./helpers/busboy')
const MultipartField = require('./MultipartField')
const { getIP } = require('./utils')

// ExpressJS compatibility packages
const accepts = require('./helpers/accepts')
const parseRange = require('./helpers/range-parser')
const typeIs = require('./helpers/type-is')
const isIP = require('net').isIP

class Request extends Readable {
  constructor (rawRequest, rawResponse, pathParametersKey, opts) {
    // Initialize the request readable stream for body consumption
    super()

    // Pre-parse core data attached to volatile uWebsockets request/response objects
    this.rawRequest = rawRequest
    this.rawResponse = rawResponse
    this.options = opts

    this.headers = {}
    this.path_parameters = {}

    // Parse basic request information that will be made unavailable after this synchronous call from uWS.HttpRequest
    this._parse_request_information()

    // Parse path parameters from request path if we have a path parameters parsing key
    if (pathParametersKey.length !== 0) this._parse_path_parameters(pathParametersKey)
  }

  /**
     * @private
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method parses initial data from uWS.Request and uWS.Response to prevent forbidden
     * stack memory access errors for asynchronous usage
     */
  _parse_request_information () {
    // Perform request pre-parsing for common access data
    // This is required as uWS.Request is forbidden for access after initial execution
    this.method = this.rawRequest.getMethod().toUpperCase()
    this.path = this.rawRequest.getUrl()
    this._query = this.rawRequest.getQuery()
    this.url = this.path + (this._query ? '?' + this._query : '')
    // this.remote_ip = this.rawResponse.getRemoteAddressAsText()
    // this.remote_proxy_ip = this.rawResponse.getProxiedRemoteAddressAsText()

    // Parse headers into a key-value object
    this.rawRequest.forEach((key, value) => (this.headers[key] = value))
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
      if (!this.path_parameters[parametersKey[i][0]]) {
        this.path_parameters[parametersKey[i][0]] = this.rawRequest.getParameter(parametersKey[i][1])
      } else if (typeof this.path_parameters[parametersKey[i][0]] === 'string') {
        this.path_parameters[parametersKey[i][0]] = [this.path_parameters[parametersKey[i][0]], this.rawRequest.getParameter(parametersKey[i][1])]
      } else if (Array.isArray(this.path_parameters[parametersKey[i][0]])) {
        this.path_parameters[parametersKey[i][0]].push(this.rawRequest.getParameter(parametersKey[i][1]))
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
      this.rawResponse.pause()
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
      this.rawResponse.resume()
      return super.resume()
    }
    return this
  }

  /**
     * Pipes the request body stream data to the provided destination stream with the provided set of options.
     *
     * @param {stream.Writable} destination
     * @param {stream.WritableOptions} options
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
    this.rawResponse.onData((arrayBuffer, isLast) => {
      // Do not process chunk if the readable stream is no longer active
      if (this.stream_ended || this.readableEnded || this.readableAborted) return

      // Convert the ArrayBuffer to a Buffer reference
      // Provide raw chunks if specified and we have something consuming stream already
      // This will prevent unneccessary duplication of buffers
      let buffer
      const rawListeners = this.listenerCount('data')
      if (rawListeners > 0 && this.stream_raw_chunks) {
        // Store a direct Buffer reference as this will be immediately consumed
        buffer = Buffer.from(arrayBuffer)
      } else {
        // Store a copy of the array_buffer as we have no immediate consumer yet
        // If we do not copy, this chunk will be lost in stream queue as it will be deallocated by uWebsockets
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
     * @param {Number} contentLength
     * @returns {Promise}
     */
  _download_buffer (contentLength) {
    // Return pending buffer promise if in flight
    if (this.buffer_promise) return this.buffer_promise

    // Resolve an empty buffer instantly if we have no readable body stream
    if (this.readableEnded) {
      this.body_buffer = Buffer.from('')
      return Promise.resolve(this.body_buffer)
    }

    // Mark this instance to provide raw buffers through readable stream
    this.stream_raw_chunks = true

    // Initiate a buffer promise with chunk retrieval process
    this.buffer_promise = new Promise((resolve) => {
      // Store promise resolve method to allow closure from _abort_buffer() method
      this.buffer_resolve = resolve

      // Allocate an empty body buffer to store all incoming chunks depending on buffering scheme
      const body = {
        cursor: 0,
        buffer: Buffer[this.options.fast_buffers ? 'allocUnsafe' : 'alloc'](contentLength)
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
      super.resume()
    })

    // Bind a then handler for caching the downloaded buffer

    // this.buffer_promise.then((buffer) => (this.body_buffer = buffer))
    // return this.buffer_promise

    return this.buffer_promise.then((buffer) => (this.body_buffer = buffer))
  }

  /**
     * Downloads and returns request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
  buffer () {
    // Check cache and return if body has already been parsed
    if (this.body_buffer) return Promise.resolve(this.body_buffer)

    // Resolve empty if invalid content-length header detected
    const contentLength = Number(this.headers['content-length'])
    if (isNaN(contentLength) || contentLength < 1) {
      this.body_buffer = Buffer.from('')
      return Promise.resolve(this.body_buffer)
    }

    // Initiate buffer download
    return this._download_buffer(contentLength)
  }

  /**
     * Downloads and parses the request body as a String.
     * @returns {Promise<string>}
     */
  async text () {
    // Resolve from cache if available
    if (this.body_text) return this.body_text

    // Retrieve body buffer, convert to string, cache and resolve
    this.body_text = (this.body_buffer || (await this.buffer())).toString()
    return this.body_text
  }

  /**
     * Parses JSON from provided string.
     * Resolves default_value or throws exception on failure.
     *
     * @private
     * @param {String} string
     * @param {Any} defaultValue
     * @returns {Any}
     */
  _parse_json (string, defaultValue) {
    // Unsafely parse JSON as we do not have a default_value
    if (defaultValue === undefined) return JSON.parse(string)

    // Safely parse JSON as we have a default_value
    let json
    try {
      json = JSON.parse(string)
    } catch (error) {
      return defaultValue
    }
    return json
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
    this.body_json = this._parse_json(text, defaultValue)
    return this.body_json
  }

  /**
     * Parses and resolves an Object of urlencoded values from body.
     * @returns {Promise}
     */
  async urlencoded () {
    // Return from cache if available
    if (this.body_urlencoded) return this.body_urlencoded

    // Retrieve text body, parse as a query string, cache and resolve
    // this.body_urlencoded = qsParse(this.body_text || (await this.text()))
    // return this.body_urlencoded

    return (this.body_urlencoded = qsParse(this.body_text || (await this.text())))
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
    if (this.multipart_promise instanceof Promise) {
      // We will keep the request paused so we do not receive more chunks
      this.pause()
      await this.multipart_promise
      this.resume()
    }

    // Trigger the user specified handler with the multipart field
    const output = handler(field)

    // If the handler returns a Promise, store it locally
    // this promise can be used to pause the request when the next field is received but user is not ready yet
    if (output instanceof Promise) {
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
     * @typedef {('PARTS_LIMIT_REACHED'|'FILES_LIMIT_REACHED'|'FIELDS_LIMIT_REACHED')} MultipartLimitReject
     */

  /**
     * Downloads and parses incoming body as a multipart form.
     * This allows for easy consumption of fields, values and files.
     *
     * @param {busboy.BusboyConfig|SyncMultipartHandler|AsyncMultipartHandler} options
     * @param {(SyncMultipartHandler|AsyncMultipartHandler)=} handler
     * @returns {Promise<MultipartLimitReject|Error>} A promise which is resolved once all multipart fields have been processed
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
    if (typeof handler !== 'function') { throw new Error('Request.multipart(handler) -> handler must be a Function.') }

    // Resolve instantly if we have no readable body stream
    if (this.readableEnded) return Promise.resolve()

    // Resolve instantly if we do not have a valid multipart content type header
    const contentType = this.headers['content-type']
    if (!/^(multipart\/.+);(.*)$/i.test(contentType)) return Promise.resolve()

    // Return a promise which will be resolved after all incoming multipart data has been processed
    return new Promise((resolve, reject) => {
      // Create a Busboy instance which will perform
      const uploader = busboy(options)

      // Bind a 'error' event handler to emit errors
      uploader.on('error', reject)

      // Bind limit event handlers to reject as error code constants
      // eslint-disable-next-line prefer-promise-reject-errors
      uploader.on('partsLimit', () => reject('PARTS_LIMIT_REACHED'))
      // eslint-disable-next-line prefer-promise-reject-errors
      uploader.on('filesLimit', () => reject('FILES_LIMIT_REACHED'))
      // eslint-disable-next-line prefer-promise-reject-errors
      uploader.on('fieldsLimit', () => reject('FIELDS_LIMIT_REACHED'))

      // Bind a 'field' event handler to process each incoming field
      uploader.on('field', (fieldName, value, info) =>
        this._on_multipart_field(handler, fieldName, value, info)
      )

      // Bind a 'file' event handler to process each incoming file
      uploader.on('file', (fieldName, stream, info) =>
        this._on_multipart_field(handler, fieldName, stream, info)
      )

      // Bind a 'finish' event handler to resolve the upload promise
      uploader.on('close', () => {
        // Wait for any pending multipart handler promise to resolve before moving forward
        if (this.multipart_promise) {
          this.multipart_promise.then(resolve)
        } else {
          resolve()
        }
      })

      // Pipe the readable request stream into the busboy uploader
      this.pipe(uploader)
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
        return this.headers.referer || this.headers.referrer
      default:
        return this.headers[lowercase]
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
    const instance = accepts(this)
    return instance.types.apply(instance, arguments)
  }

  /**
     * ExpressJS: Checks if provided encodings are accepted.
     * @param {String|Array} encodings
     * @returns {String|Array}
     */
  acceptsEncodings () {
    const instance = accepts(this)
    return instance.encodings.apply(instance, arguments)
  }

  /**
     * ExpressJS: Checks if provided charsets are accepted
     * @param {String|Array} charsets
     * @returns {String|Array}
     */
  acceptsCharsets () {
    const instance = accepts(this)
    return instance.charsets.apply(instance, arguments)
  }

  /**
     * ExpressJS: Checks if provided languages are accepted
     * @param {String|Array} languages
     * @returns {String|Array}
     */
  acceptsLanguages () {
    const instance = accepts(this)
    return instance.languages.apply(instance, arguments)
  }

  /**
     * ExpressJS: Parse Range header field, capping to the given `size`.
     * @param {Number} size
     * @param {Object} options
     * @param {Boolean} options.combine Default: false
     * @returns {Number|Array}
     */
  range (size, options) {
    const range = this.get('Range')
    if (!range) return
    return parseRange(size, range, options)
  }

  /**
     * ExpressJS: Return the value of param `name` when present or `defaultValue`.
     * @param {String} name
     * @param {Any} default_value
     * @returns {String}
     */
  param (name, defaultValue) {
    // Parse three dataset candidates
    const body = this.body
    const pathParameters = this.path_parameters
    const queryParameters = this.query_parameters

    // First check path parameters, body, and finally query_parameters
    if (pathParameters[name] != null && Object.prototype.hasOwnProperty.call(pathParameters, name)) return pathParameters[name]
    if (body[name] != null) return body[name]
    if (queryParameters[name] != null) return queryParameters[name]

    return defaultValue
  }

  /**
     * ExpressJS: Check if the incoming request contains the "Content-Type" header field, and it contains the give mime `type`.
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
    return this.rawRequest
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
    if (this.cookies) return this.cookies

    // Parse cookies from Cookie header and cache results
    const header = this.headers.cookie
    this.cookies = header ? cookie.parse(header) : {}
    return this.cookies
  }

  /**
     * Returns query parameters from incoming request.
     * @returns {Record<string, string>}
     */
  get query_parameters () {
    // Return from cache if already parsed once
    if (this.query_parameters) return this.query_parameters

    // Parse query using qsParse and cache results

    // this.query_parameters = qsParse(this.query)
    // return this.query_parameters

    return (this.query_parameters = qsParse(this._query))
  }

  /**
     * Returns remote IP address in string format from incoming request.
     * @returns {String}
     */
  get ip () {
    // Convert Remote IP to string on first access
    if (typeof this.remote_ip !== 'string') this.remote_ip = getIP(this.rawResponse.getRemoteAddress())

    return this.remote_ip
  }

  /**
     * Returns remote proxy IP address in string format from incoming request.
     * @returns {String}
     */
  get proxy_ip () {
    // Convert Remote Proxy IP to string on first access
    if (typeof this.remote_proxy_ip !== 'string') this.remote_proxy_ip = getIP(this.rawResponse.getProxiedRemoteAddress())

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
     * ExpressJS: Alias of Request.path_parameters
     */
  get params () {
    return this.path_parameters
  }

  /**
     * ExpressJS: Returns query parameters
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
    const trustProxy = this.options.trust_proxy
    const xForwardedProto = this.get('X-Forwarded-Proto')
    if (trustProxy && xForwardedProto) {
      return xForwardedProto.indexOf(',') > -1 ? xForwardedProto.split(',')[0] : xForwardedProto
    }

    // Use uWS initially defined protocol
    return this.options.is_ssl ? 'https' : 'http'
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
    const trustProxy = this.options.trust_proxy
    const xForwardedFor = this.get('X-Forwarded-For')
    if (trustProxy && xForwardedFor) return xForwardedFor.split(',')
    return [clientIP, proxyIP]
  }

  /**
     * ExpressJS: Parse the "Host" header field to a hostname.
     */
  get hostname () {
    const trustProxy = this.options.trust_proxy
    let host = this.get('X-Forwarded-Host')

    if (!host || !trustProxy) {
      host = this.get('Host')
    } else if (host.indexOf(',') > -1) {
      // Note: X-Forwarded-Host is normally only ever a
      //       single value, but this is to be safe.
      host = host.substring(0, host.indexOf(',')).trimRight()
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

  /**
     * ExpressJS: Check if the request was an _XMLHttpRequest_.
     * @returns {Boolean}
     */
  get xhr () {
    return (this.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest'
  }
}

module.exports = Request
