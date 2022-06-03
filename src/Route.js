const { parsePathParameters } = require('./utils')

class Route {
  /**
     * Route information holder object.
     *
     * @param {String} method
     * @param {String} pattern
     * @param {Function} handler
     * @param {Map} options
     */
  constructor ({ app, method, pattern, options, handler }) {
    this._routeData = new Map()
    this._routeData.set('app', app)
    this._routeData.set('method', method.toUpperCase())
    this._routeData.set('pattern', pattern)
    this._routeData.set('handler', handler)
    this._routeData.set('options', options)
    this._routeData.set('path_parameters', parsePathParameters(pattern))
  }

  /**
     * Binds middleware to this route and sorts middlewares to ensure execution order.
     *
     * @private
     * @param {Function} handler
     */
  use (middleware) {
    // Store and sort middlewares to ensure proper execution order
    this.options.middlewares.set(this.options.middlewares.size, middleware)
    this.options.middlewares = new Map([...this.options.middlewares.entries()].sort((a, b) => a.priority - b.priority))
  }

  setRequestParser (fn) {
    this._routeData.set('requestParser', fn)
  }

  setResponseSerializer (fn) {
    this._routeData.set('responseSerializer', fn)
  }

  /* Route Getters */

  get app () {
    return this._routeData.get('app')
  }

  get method () {
    return this._routeData.get('method')
  }

  get pattern () {
    return this._routeData.get('pattern')
  }

  get handler () {
    return this._routeData.get('handler')
  }

  get options () {
    return this._routeData.get('options')
  }

  get path_parameters_key () {
    return this._routeData.get('path_parameters')
  }

  get requestParser () {
    return this._routeData.get('requestParser')
  }

  get responseSerializer () {
    return this._routeData.get('responseSerializer')
  }
}

module.exports = Route
