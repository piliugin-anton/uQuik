// eslint-disable-next-line no-unused-vars
const Stream = require('stream') // lgtm [js/unused-local-variable]
const { mergeRelativePaths, isServer, isFunction, isArray, isObject, isString, isRouter } = require('./utils')

class Router {
  constructor () {
    // Determine if Router is extended thus a Server instance
    this.is_app = isServer(this)
    this.subscribers = []
    this.records = {
      routes: [],
      middlewares: []
    }
  }

  /**
     * Registers a route in the routes array for this router.
     *
     * @private
     * @param {String} method Supported: any, get, post, delete, head, options, patch, put, trace
     * @param {String} pattern Example: "/api/v1"
     * @param {Object} options Route processor options (Optional)
     * @param {Function} handler Example: (request, response) => {}
     */
  _register_route () {
    // Initialize property holders for building a route record
    const [method, pattern] = arguments
    let options

    // Look for object/function types to parse route options, potential middlewares and route handler from remaining arguments
    const callbacks = []
    for (let i = 2; i < arguments.length; i++) {
      const parameter = arguments[i]
      if (isFunction(parameter)) {
        // Scenario: Single function
        callbacks.push(parameter)
      } else if (isArray(parameter)) {
        // Scenario: Array of functions
        callbacks.push(...parameter)
      } else if (isObject(parameter)) {
        // Scenario: Route options object
        options = parameter
      }
    }

    // Write the route handler and route options object with fallback to the default options
    const handler = callbacks.pop()
    options = options || {
      middlewares: method === 'any' ? undefined : []
    }

    // Concatenate any remaining callbacks to the route options middlewares property
    if (callbacks.length > 0) options.middlewares = (options.middlewares || []).concat(callbacks)

    // Initialize the record object which will hold information about this route
    const record = {
      method,
      pattern,
      options,
      handler
    }

    // Store record for future subscribers
    this.records.routes.push(record)

    // Create route if this is a Server extended Router instance (ROOT)
    if (this.is_app) return this._create_route(record)

    // Alert all subscribers of the new route that was created
    this.subscribers.forEach((subscriber) => subscriber('route', record))
  }

  /**
     * Registers a middleware from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {Function} middleware
     */
  _register_middleware (pattern, middleware) {
    const record = {
      pattern,
      middleware
    }

    // Store record for future subscribers
    this.records.middlewares.push(record)

    // Create middleware if this is a Server extended Router instance (ROOT)
    if (this.is_app) return this._create_middleware(record)

    // Alert all subscribers of the new middleware that was created
    this.subscribers.forEach((subscriber) => subscriber('middleware', record))
  }

  /**
     * Registers a router from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {Router} router
     */
  _register_router (pattern, router) {
    router._subscribe((event, object) => {
      // Destructure records from router
      const { routes, middlewares } = object
      switch (event) {
        case 'records':
          // Register routes from router locally with adjusted pattern
          routes.forEach((record) =>
            this._register_route(
              record.method,
              mergeRelativePaths(pattern, record.pattern),
              record.options,
              record.handler
            )
          )

          // Register middlewares from router locally with adjusted pattern
          return middlewares.forEach((record) =>
            this._register_middleware(mergeRelativePaths(pattern, record.pattern), record.middleware)
          )
        case 'route':
          // Register route from router locally with adjusted pattern
          return this._register_route(
            object.method,
            mergeRelativePaths(pattern, object.pattern),
            object.options,
            object.handler
          )
        case 'middleware':
          // Register middleware from router locally with adjusted pattern
          return this._register_middleware(
            mergeRelativePaths(pattern, object.patch),
            object.middleware
          )
      }
    })
  }

  /* Router public methods */

  /**
     * Subscribes a handler which will be invocated with changes.
     *
     * @private
     * @param {*} handler
     */
  _subscribe (handler) {
    // Pipe all records on first subscription to synchronize
    handler('records', this.records)

    // Register subscriber handler for future updates
    this.subscribers.push(handler)
  }

  /**
     * @typedef MiddlewareHandler
     * @type {function(Request, Response, Function):void}
     */

  /**
     * Registers middlewares and router instances on the specified pattern if specified.
     * If no pattern is specified, the middleware/router instance will be mounted on the '/' root path by default of this instance.
     *
     * @param {...(String|MiddlewareHandler|Router)} args (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     */
  use () {
    // Parse a pattern for this use call with a fallback to the local-global scope aka. '/' pattern
    const pattern = isString(arguments[0]) ? arguments[0] : '/'

    // Validate that the pattern value does not contain any wildcard or path parameter prefixes which are not allowed
    if (pattern.indexOf('*') > -1 || pattern.indexOf(':') > -1) {
      throw new Error(
        'Server/Router.use() -> Wildcard "*" & ":parameter" prefixed paths are not allowed when binding middlewares or routers using this method.'
      )
    }

    // Register each candidate individually depending on the type of candidate value
    for (let i = 0; i < arguments.length; i++) {
      const candidate = arguments[i]
      if (isFunction(candidate)) {
        // Scenario: Single function
        this._register_middleware(pattern, candidate)
      } else if (isArray(candidate)) {
        // Scenario: Array of functions
        candidate.forEach((middleware) => this._register_middleware(pattern, middleware))
      } else if (isRouter(candidate)) {
        // Scenario: Router instance
        this._register_router(pattern, candidate)
      } else if (isObject(candidate) && isFunction(candidate.middleware)) {
        // Scenario: Inferred middleware
        this._register_middleware(pattern, candidate.middleware)
      }
    }
  }

  /**
     * @typedef {Object} RouteOptions
     * @property {Number} max_body_length Overrides the global maximum body length specified in Server constructor options.
     * @property {Array.<MiddlewareHandler>|Array.<PromiseMiddlewareHandler>} middlewares Route specific middlewares
     * @property {Object} streaming Global content streaming options.
     * @property {Stream.ReadableOptions} streaming.readable Global content streaming options for Readable streams.
     * @property {Stream.WritableOptions} streaming.writable Global content streaming options for Writable streams.
     */

  /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */

  /**
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  any () {
    return this._register_route('any', ...arguments)
  }

  /**
     * Alias of any() method.
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  all () {
    // Alias of any() method
    return this.any(...arguments)
  }

  /**
     * Creates an HTTP route that handles GET method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  get () {
    return this._register_route('get', ...arguments)
  }

  /**
     * Creates an HTTP route that handles POST method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  post () {
    return this._register_route('post', ...arguments)
  }

  /**
     * Creates an HTTP route that handles PUT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  put () {
    return this._register_route('put', ...arguments)
  }

  /**
     * Creates an HTTP route that handles DELETE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  delete () {
    return this._register_route('delete', ...arguments)
  }

  /**
     * Creates an HTTP route that handles HEAD method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  head () {
    return this._register_route('head', ...arguments)
  }

  /**
     * Creates an HTTP route that handles OPTIONS method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  options () {
    return this._register_route('options', ...arguments)
  }

  /**
     * Creates an HTTP route that handles PATCH method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  patch () {
    return this._register_route('patch', ...arguments)
  }

  /**
     * Creates an HTTP route that handles TRACE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  trace () {
    return this._register_route('trace', ...arguments)
  }

  /**
     * Creates an HTTP route that handles CONNECT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
  connect () {
    return this._register_route('connect', ...arguments)
  }

  /* Route getters */

  /**
     * Returns All routes in this router in the order they were registered.
     * @returns {Array}
     */
  get routes () {
    return this.records.routes
  }

  /**
     * Returns all middlewares in this router in the order they were registered.
     * @returns {Array}
     */
  get middlewares () {
    return this.records.middlewares
  }
}

module.exports = Router
