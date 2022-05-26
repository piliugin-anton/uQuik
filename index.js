const uWebsockets = require('uWebSockets.js')
const Server = require('./src/Server')
const Router = require('./src/Router')

module.exports = {
  Server,
  Router,
  compressors: uWebsockets // This will expose all compressors from uws directly
}
