'use strict';

/**
 * Storage driver interface.
 *
 * Concrete drivers (local disk, Cloudinary, S3, …) implement this contract so
 * upload consumers never depend on a specific provider.
 *
 * @typedef {object} StoredFile
 * @property {string} url Publicly reachable URL.
 * @property {string} key Provider-specific identifier used for deletion.
 * @property {string} provider Driver name.
 * @property {string} originalName
 * @property {string} mimeType
 * @property {number} size Bytes.
 * @property {string} kind One of `FILE_KINDS`.
 */
class StorageDriver {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    throw new Error('StorageDriver.name must be implemented');
  }

  /**
   * Persist a buffered upload.
   * @param {{buffer: Buffer, originalname: string, mimetype: string, size: number}} file
   * @param {{folder?: string, kind?: string}} [options]
   * @returns {Promise<StoredFile>}
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async upload(file, options = {}) {
    throw new Error('StorageDriver.upload must be implemented');
  }

  /**
   * Remove a previously stored file. Must resolve (not throw) when the object
   * is already gone so deletes stay idempotent.
   * @param {string} key
   * @param {{kind?: string}} [options]
   * @returns {Promise<boolean>}
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async remove(key, options = {}) {
    throw new Error('StorageDriver.remove must be implemented');
  }

  /**
   * Resolve a URL suitable for download (may be time-limited).
   * @param {StoredFile} storedFile
   * @returns {Promise<string>}
   */
  async getDownloadUrl(storedFile) {
    return storedFile.url;
  }
}

module.exports = StorageDriver;
