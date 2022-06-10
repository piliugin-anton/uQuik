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
    this._routeData = new Map([
      ['app', app],
      ['method', method.toUpperCase()],
      ['pattern', pattern],
      ['handler', handler],
      ['options', options],
      ['path_parameters', parsePathParameters(pattern)],
      ['requestDecorators', new Map()],
      ['responseDecorators', new Map()]
    ])
  }

  /**
     * Binds middleware to this route and sorts middlewares to ensure execution order.
     *
     * @private
     * @param {Function} handler
     */
  use (middleware) {
    // Store and sort middlewares to ensure proper execution order
    this.middlewares.set(this.middlewares.size, middleware)
    this.options.set('middlewares', new Map([...this.middlewares.entries()].map(([key, value]) => value).sort((a, b) => a.priority - b.priority).map((value, index) => [index, value])))
  }

  setRequestDecorator (object) {
    if (this.requestDecorators.has(object.name)) {
      throw new Error(`Request decorator with name ${object.name} already exist`)
    }

    this.requestDecorators.set(object.name, object.fn)
  }

  setResponseDecorator (object) {
    if (this.responseDecorators.has(object.name)) {
      throw new Error(`Response decorator with name ${object.name} already exist`)
    }

    this.responseDecorators.set(object.name, object.fn)
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

  get middlewares () {
    return this.options.get('middlewares')
  }

  get path_parameters_key () {
    return this._routeData.get('path_parameters')
  }

  get requestDecorators () {
    return this._routeData.get('requestDecorators')
  }

  get responseDecorators () {
    return this._routeData.get('responseDecorators')
  }
}

module.exports = Route
