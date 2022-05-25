const { isString, isFunction, isObject } = require('./utils')

class uQuikRouter {
  constructor () {
    this.isApp = this.constructor.name === 'uQuikServer'
  }

  get (pattern, handler, options = {}) {
    this._addRoute('get', pattern, handler, options)
  }

  post (pattern, handler, options = {}) {
    this._addRoute('post', pattern, handler, options)
  }

  options (pattern, handler, options = {}) {
    this._addRoute('options', pattern, handler, options)
  }

  delete (pattern, handler, options = {}) {
    this._addRoute('delete', pattern, handler, options)
  }

  patch (pattern, handler, options = {}) {
    this._addRoute('patch', pattern, handler, options)
  }

  put (pattern, handler, options = {}) {
    this._addRoute('put', pattern, handler, options)
  }

  head (pattern, handler, options = {}) {
    this._addRoute('head', pattern, handler, options)
  }

  _addRoute (method, pattern, handler, options) {
    if (!isString(method) || !method.length) {
      throw new Error(`Route method must be a string, ${typeof method} given`)
    }

    if (uQuikRouter.METHODS.indexOf(method) === -1) {
      throw new Error(`Possible methods are ${uQuikRouter.METHODS.join(', ')}`)
    }

    if (!isString(pattern) || !pattern.length) {
      throw new Error(`Route pattern must be a string, ${typeof pattern} given`)
    }

    if (!isFunction(handler)) {
      throw new Error(`Route handler must be a function, ${typeof handler} given`)
    }

    if (!isObject(options)) {
      throw new Error(`Options must be an object, ${typeof options} given`)
    }

    if (this._hasRoute(method, pattern)) {
      throw new Error(`Route with pattern ${pattern} and method ${method} already exists!`)
    }

    if (this.isApp) return this._attachRoute(method, pattern, handler)
  }

  _hasRoute (method, pattern) {
    return this.routes[method][pattern]
  }

  static get METHODS () {
    return ['get', 'post', 'options', 'delete', 'patch', 'put', 'head']
  }
}

module.exports = uQuikRouter
