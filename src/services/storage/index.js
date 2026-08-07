'use strict';

const env = require('../../config/env');
const logger = require('../../config/logger');
const ApiError = require('../../core/ApiError');
const LocalStorageDriver = require('./LocalStorageDriver');
const CloudinaryStorageDriver = require('./CloudinaryStorageDriver');

/**
 * Storage facade.
 *
 * Resolves the configured driver once and exposes a provider-agnostic API to the
 * rest of the application. When `STORAGE_DRIVER=cloudinary` but credentials are
 * missing we fall back to local disk with a warning rather than crashing at
 * upload time.
 */

function resolveDriver() {
  if (env.STORAGE_DRIVER === 'cloudinary') {
    if (!env.cloudinaryConfigured) {
      logger.warn('STORAGE_DRIVER=cloudinary but credentials are incomplete — using local storage');
      return new LocalStorageDriver();
    }
    return new CloudinaryStorageDriver();
  }
  return new LocalStorageDriver();
}

const driver = resolveDriver();

const storageService = {
  driver,

  get providerName() {
    return driver.name;
  },

  /**
   * Upload one buffered file.
   * @param {object} file Multer memory-storage file.
   * @param {{folder?: string, kind?: string}} options
   */
  async upload(file, options = {}) {
    if (!file?.buffer) throw ApiError.badRequest('No file payload provided');
    try {
      return await driver.upload(file, options);
    } catch (error) {
      logger.error('File upload failed', { error: error.message, provider: driver.name });
      throw ApiError.internal('File upload failed');
    }
  },

  /** Upload several files, preserving input order. */
  async uploadMany(files = [], options = {}) {
    return Promise.all(files.map((file) => storageService.upload(file, options)));
  },

  /**
   * Best-effort delete. Never throws — an orphaned blob must not block a
   * database mutation that has already been authorised.
   */
  async remove(storedFile) {
    if (!storedFile?.key) return false;
    return driver.remove(storedFile.key, {
      kind: storedFile.kind,
      resourceType: storedFile.resourceType,
    });
  },

  async removeMany(storedFiles = []) {
    return Promise.all(storedFiles.map((file) => storageService.remove(file)));
  },

  async getDownloadUrl(storedFile) {
    return driver.getDownloadUrl(storedFile);
  },

  /** True when files live on the local filesystem (enables `res.sendFile`). */
  isLocal() {
    return driver instanceof LocalStorageDriver;
  },

  absolutePathFor(key) {
    if (!storageService.isLocal()) return null;
    return driver.absolutePathFor(key);
  },
};

module.exports = storageService;
