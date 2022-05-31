const { Readable } = require('readable-stream')
const FileSystem = require('fs')

class MultipartField {
  constructor (name, value, info) {
    // Store general information about this field
    this._name = name
    this._encoding = info.encoding
    this._mime_type = info.mimeType

    // Determine if this field is a file or a normal field
    if (value instanceof Readable) {
      // Store this file's supplied name and data stream
      this._file = {
        name: info.filename,
        stream: value
      }
    } else {
      // Store field value and truncation information
      this._value = value
      this._truncated = {
        name: info.nameTruncated,
        value: info.valueTruncated
      }
    }
  }

  /* MultipartField Methods */

  /**
     * Saves this multipart file content to the specified path.
     * Note! You must specify the file name and extension in the path itself.
     *
     * @param {String} path Path with file name to which you would like to save this file.
     * @param {stream.WritableOptions} options Writable stream options
     * @returns {Promise}
     */
  write (path, options) {
    // Throw an error if this method is called on a non file field
    if (this.file === undefined) {
      throw new Error(
        'Request.MultipartField.write(path, options) -> This method can only be called on a field that is a file type.'
      )
    }

    // Return a promise which resolves once write stream has finished
    return new Promise((resolve, reject) => {
      const writable = FileSystem.createWriteStream(path, options)
      writable.on('close', resolve)
      writable.on('error', reject)
      this.file.stream.pipe(writable)
    })
  }

  /* MultipartField Properties */

  /**
     * Field name as specified in the multipart form.
     * @returns {String}
     */
  get name () {
    return this._name
  }

  /**
     * Field encoding as specified in the multipart form.
     * @returns {String}
     */
  get encoding () {
    return this._encoding
  }

  /**
     * Field mime type as specified in the multipart form.
     * @returns {String}
     */
  get mime_type () {
    return this._mime_type
  }

  /**
     * @typedef {Object} MultipartFile
     * @property {String=} name If supplied, this file's name as supplied by sender.
     * @property {stream.Readable} stream Readable stream to consume this file's data.
     */

  /**
     * Returns file information about this field if it is a file type.
     * Note! This property will ONLY be defined if this field is a file type.
     *
     * @returns {MultipartFile}
     */
  get file () {
    return this._file
  }

  /**
     * Returns field value if this field is a non-file type.
     * Note! This property will ONLY be defined if this field is a non-file type.
     *
     * @returns {String}
     */
  get value () {
    return this._value
  }

  /**
     * @typedef {Object} Truncations
     * @property {Boolean} name Whether this field's name was truncated.
     * @property {Boolean} value Whether this field's value was truncated.
     */

  /**
     * Returns information about truncations in this field.
     * Note! This property will ONLY be defined if this field is a non-file type.
     *
     * @returns {Truncations}
     */
  get truncated () {
    return this._truncated
  }
}

module.exports = MultipartField
