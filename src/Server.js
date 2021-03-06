const uWebSockets = require('uWebSockets.js')
const AjvJTD = require('ajv/dist/jtd')
const fastUri = require('fast-uri')
const Router = require('./Router')
const Route = require('./Route')
const Request = require('./Request')
const Response = require('./Response')
const CustomError = require('./CustomError')
// eslint-disable-next-line no-unused-vars
const Stream = require('readable-stream') // lgtm [js/unused-local-variable]
const JWT = require('./JWT')

class Server extends Router {
  /**
     * @param {Object} options Server Options
     * @param {String} options.cert_file_name Path to SSL certificate file.
     * @param {String} options.key_file_name Path to SSL private key file to be used for SSL/TLS.
     * @param {String} options.passphrase Strong passphrase for SSL cryptographic purposes.
     * @param {String} options.dh_params_file_name Path to SSL Diffie-Hellman parameters file.
     * @param {Boolean} options.ssl_prefer_low_memory_usage Specifies uWebsockets to prefer lower memory usage while serving SSL
     * @param {String} options.ssl_ciphers Undocumented
     * @param {Boolean} options.fast_buffers Buffer.allocUnsafe is used when set to true for faster performance.
     * @param {Boolean} options.fast_abort Determines whether  will abrubptly close bad requests. This can be much faster but the client does not receive an HTTP status code as it is a premature connection closure.
     * @param {Boolean} options.trust_proxy Specifies whether to trust incoming request data from intermediate proxy(s)
     * @param {Number} options.max_body_length Maximum body content length allowed in bytes. For Reference: 1kb = 1000 bytes and 1mb = 1000kb. Default: 256Kb
     * @param {Boolean} options.auto_close Whether to automatically close the server instance when the process exits. Default: true
     * @param {Object} options.ajv Ajv-JTD options
     * @param {Boolean|Object} options.json_errors Boolean or Object containing a JTD schema
     */
  constructor (options = {}) {
    // Only accept object as a parameter type for options
    if (options == null || typeof options !== 'object') {
      throw new Error(
        'Server constructor only accepts an object type for the options parameter.'
      )
    }

    // Initialize extended Router instance
    super()

    this._options = new Map([
      ['cert_file_name', options.cert_file_name || undefined],
      ['key_file_name', options.key_file_name || undefined],
      ['passphrase', options.passphrase || undefined],
      ['dh_params_file_name', options.dh_params_file_name || undefined],
      ['ssl_ciphers', options.ssl_ciphers || undefined],
      ['ssl_prefer_low_memory_usage', options.ssl_prefer_low_memory_usage || false],
      ['is_ssl', options.cert_file_name && options.key_file_name],
      ['auto_close', options.auto_close || true],
      ['fast_abort', options.fast_abort || false],
      ['trust_proxy', options.trust_proxy || false],
      ['unsafe_buffers', options.unsafe_buffers || false],
      ['max_body_length', options.max_body_length || 256000],
      ['ajv', typeof options.ajv === 'object' ? options.ajv : {}],
      ['json_errors', options.json_errors || false]
    ])

    const jsonErrors = this._options.get('json_errors')

    this._routes_locked = false

    this.handlers = new Map([
      ['on_not_found', (request, response) => response.status(404).send()],
      ['on_error', (request, response, error) => {
        if (process.env.NODE_ENV === 'development') console.log(error)

        if (response.initiated || response.completed || request.streaming) return response.close()

        if (error instanceof CustomError) {
          response.status(error.status)

          if (jsonErrors) {
            return response
              .header('Content-Type', 'application/json')
              .send(this._options.get('json_error_serializer')({ error: error.message }))
          }

          return response.send(error.message)
        }

        return response.status(500).send('Uncaught Exception Occured')
      }]
    ])

    this._middlewares = new Map([
      // This will contain global middlewares
      ['__GLOBAL__', new Map()]
    ])

    this._routes = new Map([
      ['any', new Map()],
      ['get', new Map()],
      ['post', new Map()],
      ['options', new Map()],
      ['head', new Map()],
      ['put', new Map()],
      ['delete', new Map()],
      ['patch', new Map()],
      ['trace', new Map()]
    ])

    this.ajv = new AjvJTD({
      coerceTypes: 'array',
      useDefaults: true,
      removeAdditional: true,
      uriResolver: fastUri,
      // Explicitly set allErrors to `false`.
      // When set to `true`, a DoS attack is possible.
      allErrors: false,
      ...this._options.get('ajv')
    })

    if (jsonErrors) {
      this._options.set('json_error_serializer', this.ajv.compileSerializer(typeof jsonErrors === 'object' ? jsonErrors : { properties: { error: { type: 'string' } } }))
    }

    // Create underlying uWebsockets App or SSLApp to power
    if (this._options.get('is_ssl')) {
      this.uws_instance = uWebSockets.SSLApp({
        key_file_name: this._options.get('key_file_name'),
        cert_file_name: this._options.get('cert_file_name'),
        passphrase: this._options.get('passphrase'),
        dh_params_file_name: this._options.get('dh_params_file_name'),
        ssl_ciphers: this._options.get('ssl_ciphers'),
        /** This translates to SSL_MODE_RELEASE_BUFFERS */
        ssl_prefer_low_memory_usage: this._options.get('ssl_prefer_low_memory_usage')
      })
    } else {
      this.uws_instance = uWebSockets.App()
    }
  }

  /**
     * @private
     * This method binds a cleanup handler which automatically closes this Server instance.
     */
  _bind_auto_close () {
    ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((type) =>
      process.once(type, () => this.close())
    )
  }

  /**
     * Adds server name
     *
     * @param {String} hostname Hostname
     * @returns {Server} Server instance
     */
  addServerName (hostname) {
    this._options.set('host', hostname)
    this.uws_instance.addServerName(hostname)
    return this
  }

  /**
     * Starts  webserver on specified port and host.
     *
     * @param {Number} port
     * @param {String=} host Optional. Default: 127.0.0.1
     * @returns {Promise} Promise
     */
  listen (port, host = '127.0.0.1') {
    if (!this._options.has('host')) this._options.set('host', host)
    this._options.set('port', port)
    // Adding not found handler (404)
    this.any('/*', (request, response) => this.handlers.get('on_not_found')(request, response))
    // Lock routes modification
    this._routes_locked = true
    // Attach middleware
    this._attach_middlewares()

    return new Promise((resolve, reject) =>
      this.uws_instance.listen(host, port, (listenSocket) => {
        if (listenSocket) {
          // Store the listen socket for future closure & bind the auto close handler if enabled from constructor options
          this.listen_socket = listenSocket
          if (this._options.get('auto_close')) this._bind_auto_close()
          resolve(listenSocket)
          process.send('ready')
        } else {
          reject(new Error('No Socket Received From uWebsockets.js'))
        }
      })
    )
  }

  /**
     * Stops/Closes  webserver instance.
     *
     * @param {uWebSockets.us_listen_socket=} [listen_socket] Optional
     * @returns {Boolean}
     */
  close (listenSocket) {
    // Fall back to self listen socket if none provided by user
    const socket = listenSocket || this.listen_socket
    if (socket) {
      // Close the listen socket from uWebsockets and nullify the reference
      uWebSockets.us_listen_socket_close(socket)
      this.listen_socket = null
      return true
    }
    return false
  }

  /**
     * @typedef RouteErrorHandler
     * @type {function(Request, Response, Error):void}
     */

  /**
     * Sets a global error handler which will catch most uncaught errors across all routes/middlewares.
     *
     * @param {RouteErrorHandler} handler Hanlder function
     * @param {Object=} options Error handler options
     * @param {Boolean|Object} options.json Boolean or JTD schema object
     */
  set_error_handler (handler, options = {}) {
    if (typeof handler !== 'function') throw new Error('handler must be a function')

    this.handlers.set('on_error', handler)

    if (options && options.json) {
      this._options.set('json_errors', true)

      this._options.set('json_error_serializer', typeof options.json === 'object' ? this.ajv.compileSerializer(options.json) : JSON.parse)
    }
  }

  /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */

  /**
     * Sets a global not found handler which will handle all requests that are unhandled by any registered route.
     * Note! This handler must be registered after all routes and routers.
     *
     * @param {RouteHandler} handler
     */
  set_not_found_handler (handler) {
    if (typeof handler !== 'function') throw new Error('handler must be a function')

    // Store not_found handler and bind it as a catchall route
    this.handlers.set('on_not_found', handler)
  }

  /**
     * Binds route to uWS server instance and begins handling incoming requests.
     *
     * @private
     * @param {Object} record { method, pattern, options, handler }
     */
  _create_route (record) {
    // Do not allow route creation once it is locked after a not found handler has been bound
    if (this._routes_locked) {
      throw new Error(`Routes/Routers can not be created when server is started. [${record.method.toUpperCase()} ${record.pattern}]`)
    }

    // Do not allow duplicate routes for performance/stability reasons
    if (this._routes.get(record.method).has(record.pattern)) throw new Error(`Failed to create route as duplicate routes are not allowed. Ensure that you do not have any routers or routes that try to handle requests at the same pattern. [${record.method.toUpperCase()} ${record.pattern}]`)

    const route = new Route({
      appOptions: this._options,
      method: record.method,
      pattern: record.pattern,
      options: record.options,
      handler: record.handler
    })

    // Mark route as temporary if specified from options
    if (record.options._temporary === true) route._temporary = true

    // JSON Schema validation
    if (record.options.has('schema')) {
      const schema = record.options.get('schema')
      if (typeof schema === 'object') {
        if (typeof schema.request === 'object') {
          route.setRequestDecorator({
            name: 'JSONParse',
            fn: this.ajv.compileParser(schema.request)
          })
        }
        if (typeof schema.response === 'object') {
          route.setResponseDecorator({
            name: 'JSONSerialize',
            fn: this.ajv.compileSerializer(schema.response)
          })
        }
      }
    }

    // JWT
    if (record.options.has('jwt')) {
      const jwtOptions = record.options.get('jwt')

      if (typeof jwtOptions === 'object') {
        const [requestVerifier, responseSigner] = JWT(jwtOptions)
        route.setRequestDecorator(requestVerifier)
        route.setResponseDecorator(responseSigner)
      }
    }

    this._routes.get(record.method).set(record.pattern, route)

    // Bind uWS.method() route which passes incoming request/respone to our handler
    return this.uws_instance[record.method](record.pattern, (response, request) => this._handle_uws_request(this._routes.get(record.method).get(record.pattern), request, response))
  }

  /**
     * Binds middleware to server instance and distributes over all created routes.
     *
     * @private
     * @param {Object} record
     */
  _create_middleware (record) {
    // Do not allow middleware creation once routes is locked
    if (this._routes_locked) {
      throw new Error(`Middlewares can not be created when server is started. [${record.pattern}]`)
    }
    // Initialize middlewares array for specified pattern
    if (!this._middlewares.has(record.pattern)) this._middlewares.set(record.pattern, new Map())

    // Create a middleware object with an appropriate priority
    const map = new Map([
      ['priority', record.pattern === '__GLOBAL__' ? 0 : 1], // 0 priority are global middlewares
      ['middleware', record.middleware]
    ])

    // Store middleware object in its pattern branch
    this._middlewares.get(record.pattern).set(this._middlewares.get(record.pattern).size, map)
  }

  _attach_middlewares () {
    this._middlewares.forEach((middlewares, middlewarePattern) => {
      middlewares.forEach((middleware) => {
        if (middleware.get('priority') !== 0) {
          this._routes.forEach((method) => {
            method.forEach((route, routePattern) => {
              if ((middlewarePattern === '/' && routePattern === middlewarePattern) || (middlewarePattern !== '/' && routePattern.startsWith(middlewarePattern))) route.use(middleware)
            })
          })
        }
      })
    })
  }

  /* uWS -> Server Request/Response Handling Logic */

  /**
     * This method is used to handle incoming uWebsockets response/request objects
     * by wrapping/translating them into  compatible request/response objects.
     *
     * @private
     * @param {Route} route
     * @param {Request} request
     * @param {Response} response
     */
  _handle_uws_request (route, request, response) {
    // Wrap uWS.Request -> Request
    const wrappedRequest = new Request(
      request,
      response,
      route
    )

    // Wrap uWS.Response -> Response
    const wrappedResponse = new Response(wrappedRequest, response, route, this.handlers)

    // Checking if we need to get request body
    if (wrappedRequest.contentLength) {
      // Determine and compare against a maximum incoming content length from the route options with a fallback to the server options
      const maxBodyLength = route.options.get('max_body_length') || this._options.get('max_body_length')
      if (wrappedRequest.contentLength > maxBodyLength) {
        // Use fast abort scheme if specified in the server options
        if (this._options.get('fast_abort')) return response.close()

        // For slow abort scheme, according to uWebsockets developer, we have to drain incoming data before aborting and closing request
        // Prematurely closing request with a 4xx leads to an ECONNRESET in which we lose 4xx status code from server
        return response.onData((_, isLast) => isLast && wrappedResponse.status(413).send())
      }

      // Begin streaming the incoming body data
      wrappedRequest._start_streaming()
    } else {
      // Push an EOF chunk to signify the readable has already ended thus no more content is readable
      wrappedRequest.push(null)
      // wrappedRequest._stop_streaming()
    }

    // Chain incoming request/response through all global/local/route-specific middlewares
    return this._chain_middlewares(route, wrappedRequest, wrappedResponse)
  }

  /**
     * This method chains a request/response through all middlewares and then calls route handler in end.
     *
     * @private
     * @param {Route} route - Route Object
     * @param {Request} request - Request Object
     * @param {Response} response - Response Object
     * @param {Error} error - Error or Extended Error Object
     */
  _chain_middlewares (route, request, response, cursor = 0, error = null) {
    // Break chain if response has been aborted
    if (response.aborted) return

    // Trigger error handler if an error was provided by a middleware
    if (error) return response.throw(error)

    const globalMiddlewares = this._middlewares.get('__GLOBAL__')
    const globalMiddlewaresSize = globalMiddlewares.size
    // Execute global middlewares first as they take precedence over route specific middlewares
    if (globalMiddlewaresSize !== 0 && cursor < globalMiddlewaresSize && globalMiddlewares.has(cursor)) {
      const next = (err) => this._chain_middlewares(route, request, response, cursor + 1, err)
      response._track_middleware_cursor(cursor)
      // If middleware invocation returns a Promise, bind a then handler to trigger next iterator
      const output = globalMiddlewares.get(cursor).get('middleware')(request, response, next)
      if (typeof output === 'object' && typeof output.then === 'function') output.then(next).catch(next)
      return
    }

    const routeMiddlewares = route.middlewares
    // Execute route specific middlewares if they exist
    if (routeMiddlewares.size !== 0) {
      const routeMiddlewareCursor = cursor - globalMiddlewaresSize
      if (routeMiddlewareCursor < routeMiddlewares.size && routeMiddlewares.has(routeMiddlewareCursor)) {
        const next = (err) => this._chain_middlewares(route, request, response, cursor + 1, err)
        response._track_middleware_cursor(cursor)
        // If middleware invocation returns a Promise, bind a then handler to trigger next iterator
        const output = routeMiddlewares.get(routeMiddlewareCursor).get('middleware')(request, response, next)
        if (typeof output === 'object' && typeof output.then === 'function') output.then(next).catch(next)
        return
      }
    }

    // Safely execute the user assigned handler and catch both sync/async errors.
    try {
      const output = route.handler(request, response)
      if (typeof output === 'object' && typeof output.then === 'function') output.catch((error) => response.throw(error))
    } catch (error) {
      response.throw(error)
    }
  }

  get routes () {
    return this._routes
  }
}

module.exports = Server
