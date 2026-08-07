'use strict';

const fs = require('fs/promises');
const path = require('path');

const StorageDriver = require('./StorageDriver');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { buildSafeFilename } = require('../../utils/file.util');

/**
 * Disk-backed storage driver.
 *
 * Serves as the zero-configuration default so the API is runnable without
 * cloud credentials; files are exposed statically under `/uploads`.
 */
class LocalStorageDriver extends StorageDriver {
  constructor() {
    super();
    this.rootDir = env.localUploadRoot;
  }

  get name() {
    return 'local';
  }

  /** Reject keys that try to escape the upload root. */
  #resolveSafePath(key) {
    const target = path.resolve(this.rootDir, key);
    if (target !== this.rootDir && !target.startsWith(this.rootDir + path.sep)) {
      throw new Error('Resolved storage path escapes the upload directory');
    }
    return target;
  }

  async upload(file, { folder = 'misc', kind = 'other' } = {}) {
    const safeFolder = String(folder).replace(/[^\w\-/]+/g, '-');
    const filename = buildSafeFilename(file.originalname);
    const relativeKey = path.posix.join(safeFolder, filename);
    const absolutePath = this.#resolveSafePath(relativeKey);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    return {
      url: `/${env.LOCAL_UPLOAD_DIR}/${relativeKey}`,
      key: relativeKey,
      provider: this.name,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      kind,
    };
  }

  async remove(key) {
    if (!key) return false;
    try {
      await fs.unlink(this.#resolveSafePath(key));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false; // already gone — idempotent
      logger.warn('Local file delete failed', { key, error: error.message });
      return false;
    }
  }

  /** Absolute filesystem path, used by the download endpoint's `res.sendFile`. */
  absolutePathFor(key) {
    return this.#resolveSafePath(key);
  }
}

module.exports = LocalStorageDriver;
