const uWebSockets = require('uWebSockets.js')
const uQuikRouter = require('./Router')
const uQuikRoute = require('./Route')
const uQuikRequest = require('./Request')
const uQuikResponse = require('./Response')
const { isObject, isString, isNumber } = require('./utils')

class uQuikServer extends uQuikRouter {
  constructor (options = {}) {
    if (!isObject(options)) throw new Error('Options must be object')

    super()

    const { sslKey, sslCert } = options

    this.app = isString(sslKey) && isString(sslCert) ? uWebSockets.SSLApp : uWebSockets.App

    this.routes = {}
  }

  listen (port = 3000, host = '127.0.0.1') {
    this.host = isString(host) ? host : '127.0.0.1'
    this.port = isNumber(port, true) ? port : 3000

    return new Promise((resolve, reject) => {
      this.app.listen(this.host, this.port, (socket) => {
        if (socket) {
          this.socket = socket
          resolve(this.socket)
        } else {
          reject(new Error('Server did not provided a socket'))
        }
      })
    })
  }

  shutdown () {
    if (this.socket) {
      uWebSockets.us_listen_socket_close(this.socket)

      this.socket = null

      return true
    }

    return false
  }

  _attachRoute (method, pattern, handler, options) {
    // eslint-disable-next-line new-cap
    this.routes[method][pattern] = new uQuikRoute(method, handler, options)

    this.app[method](pattern, (response, request) =>
      this._handleRequest(
        this.routes[method][pattern],
        // eslint-disable-next-line new-cap
        new uQuikRequest(this.routes[method][pattern].streams.readable, request, response),
        // eslint-disable-next-line new-cap
        new uQuikResponse(response)
      )
    )
  }

  _handleRequest (route, request, response) {
    // Determine the incoming content length if present
    if (request.contentLength) {
      // Determine and compare against a maximum incoming content length from the route options with a fallback to the server options
      const max_body_length = route.options.max_body_length || route.app._options.max_body_length
      if (content_length > max_body_length) {
        // Use fast abort scheme if specified in the server options
        if (route.app._options.fast_abort === true) return response.close()

        // For slow abort scheme, according to uWebsockets developer, we have to drain incoming data before aborting and closing request
        // Prematurely closing request with a 413 leads to an ECONNRESET in which we lose 413 status code from server
        return response.onData((_, is_last) => {
          if (is_last) wrapped_response.status(413).send()
        })
      }

      // Begin streaming the incoming body data
      wrapped_request._start_streaming()
    } else {
      // Push an EOF chunk to signify the readable has already ended thus no more content is readable
      wrapped_request.push(null)
    }

  // Chain incoming request/response through all global/local/route-specific middlewares
  }
}

module.exports = uQuikServer
