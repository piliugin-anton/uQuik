const FileSystem = require('fs')
const EventEmitter = require('events')
const { asyncWait } = require('./utils')

class LiveFile extends EventEmitter {
  constructor (options = {}) {
    // Initialize EventEmitter instance
    super()

    this.options = {
      path: '',
      retry: {
        every: 300,
        max: 3
      },
      ...options
    }

    // Determine the name of the file
    const chunks = options.path.split('/')
    this.name = chunks[chunks.length - 1]

    // Determine the extension of the file
    this.extension = this.options.path.split('.')
    this.extension = this.extension[this.extension.length - 1]

    // Initialize file watcher to keep file updated in memory
    this.reload()
    this._initiate_watcher()
  }

  /**
     * @private
     * Initializes File Watcher to reload file on changes
     */
  _initiate_watcher () {
    // Create FileWatcher that trigger reload method
    this.watcher = FileSystem.watch(this.options.path, () => this.reload())
  }

  /**
     * Reloads buffer/content for file asynchronously with retry policy.
     *
     * @private
     * @param {Boolean} fresh
     * @param {Number} count
     * @returns {Promise}
     */
  reload (fresh = true, count = 0) {
    if (fresh) {
      // Reuse promise if there if one pending
      if (this.reload_promise instanceof Promise) return this.reload_promise

      // Create a new promise for fresh lookups
      this.reload_promise = new Promise((resolve, reject) => {
        this.reload_resolve = resolve
        this.reload_reject = reject
      })
    }

    // Perform filesystem lookup query
    FileSystem.readFile(this.options.path, async (error, buffer) => {
      // Pipe filesystem error through promise
      if (error) {
        this._flush_ready()
        return this.reload_reject(error)
      }

      // Perform retries in accordance with retry policy
      // This is to prevent empty reads on atomicity based modifications from third-party programs
      const { every, max } = this.options.retry
      if (buffer.length === 0 && count < max) {
        await asyncWait(every)
        return this.reload(false, count + 1)
      }

      // Update instance buffer/content/last_update variables
      this.buffer = buffer
      this.content = buffer.toString()
      this.last_update = Date.now()

      // Cleanup reload promises and methods
      this.reload_resolve()
      this._flush_ready()
      this.reload_resolve = null
      this.reload_reject = null
      this.reload_promise = null
    })

    return this.reload_promise
  }

  /**
     * Flushes pending ready promise.
     * @private
     */
  _flush_ready () {
    if (typeof this.ready_resolve === 'function') {
      this.ready_resolve()
      this.ready_resolve = null
    }
    this.ready_promise = true
  }

  /**
     * Returns a promise which resolves once first reload is complete.
     *
     * @returns {Promise}
     */
  ready () {
    // Return true if no ready promise exists
    if (this.ready_promise === true) return Promise.resolve()

    // Create a Promise if one does not exist for ready event
    if (this.ready_promise === undefined) { this.ready_promise = new Promise((resolve) => (this.ready_resolve = resolve)) }

    return this.ready_promise
  }

  /* LiveFile Getters */
  get is_ready () {
    return this.ready_promise === true
  }

  get path () {
    return this.options.path
  }
}

module.exports = LiveFile
