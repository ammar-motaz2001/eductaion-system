'use strict';

const { v2: cloudinary } = require('cloudinary');

const StorageDriver = require('./StorageDriver');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { FILE_KINDS } = require('../../core/constants');

/**
 * Cloudinary-backed storage driver.
 *
 * Non-media files (PDF, Office documents) are uploaded as `raw` so Cloudinary
 * does not attempt image transformations on them.
 */
class CloudinaryStorageDriver extends StorageDriver {
  constructor() {
    super();
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    this.client = cloudinary;
  }

  get name() {
    return 'cloudinary';
  }

  /** Map our logical file kind onto Cloudinary's resource_type taxonomy. */
  static resourceTypeFor(kind) {
    if (kind === FILE_KINDS.IMAGE) return 'image';
    if (kind === FILE_KINDS.VIDEO) return 'video';
    return 'raw';
  }

  async upload(file, { folder = 'misc', kind = FILE_KINDS.OTHER } = {}) {
    const resourceType = CloudinaryStorageDriver.resourceTypeFor(kind);

    const result = await new Promise((resolve, reject) => {
      const stream = this.client.uploader.upload_stream(
        {
          folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true,
          overwrite: false,
        },
        (error, uploadResult) => (error ? reject(error) : resolve(uploadResult))
      );
      stream.end(file.buffer);
    });

    return {
      url: result.secure_url,
      key: result.public_id,
      provider: this.name,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size ?? result.bytes,
      kind,
      resourceType,
    };
  }

  async remove(key, { kind = FILE_KINDS.OTHER, resourceType } = {}) {
    if (!key) return false;
    try {
      const result = await this.client.uploader.destroy(key, {
        resource_type: resourceType || CloudinaryStorageDriver.resourceTypeFor(kind),
        invalidate: true,
      });
      return result.result === 'ok' || result.result === 'not found';
    } catch (error) {
      logger.warn('Cloudinary delete failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Signed, expiring URL that forces a download with the original filename.
   */
  async getDownloadUrl(storedFile) {
    const resourceType =
      storedFile.resourceType || CloudinaryStorageDriver.resourceTypeFor(storedFile.kind);
    return this.client.utils.private_download_url
      ? storedFile.url
      : this.client.url(storedFile.key, {
          resource_type: resourceType,
          flags: 'attachment',
          secure: true,
        });
  }
}

module.exports = CloudinaryStorageDriver;
