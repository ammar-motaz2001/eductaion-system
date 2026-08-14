'use strict';

const multer = require('multer');

const env = require('../config/env');
const ApiError = require('../core/ApiError');
const { FILE_KINDS } = require('../core/constants');
const { resolveFileKind, LESSON_FILE_KINDS } = require('../utils/file.util');

/**
 * Multer upload middleware factory.
 *
 * Memory storage is used so the buffer can be handed straight to whichever
 * storage driver is configured, and so nothing untrusted is ever written to
 * disk before validation passes.
 */

/**
 * @param {string[]} allowedKinds Logical file kinds to accept.
 * @returns {multer.Options['fileFilter']}
 */
function buildFileFilter(allowedKinds) {
  return (req, file, callback) => {
    const kind = resolveFileKind(file.mimetype, file.originalname);
    if (!kind || !allowedKinds.includes(kind)) {
      return callback(
        ApiError.unsupportedMediaType(
          `Unsupported file type "${file.mimetype}". Allowed: ${allowedKinds.join(', ')}`
        )
      );
    }
    // Stash the resolved kind so the controller does not have to re-derive it.
    file.resolvedKind = kind;
    return callback(null, true);
  };
}

/** Multer entry points that return a request handler. */
const MULTER_METHODS = ['single', 'array', 'fields', 'none', 'any'];

/**
 * Wrap a multer instance so every handler it produces first records the cap it
 * enforces on the request. Without this, `handleUploadErrors` cannot tell which
 * uploader rejected the file and would always report the global limit.
 *
 * @param {multer.Multer} instance
 * @param {number} maxSizeMb
 */
function tagLimit(instance, maxSizeMb) {
  const record = (req, _res, next) => {
    req.uploadMaxSizeMb = maxSizeMb;
    next();
  };

  return MULTER_METHODS.reduce((wrapped, method) => {
    wrapped[method] = (...args) => [record, instance[method](...args)];
    return wrapped;
  }, {});
}

/**
 * @param {object} [options]
 * @param {string[]} [options.kinds] Allowed logical kinds.
 * @param {number} [options.maxSizeMb] Per-file size cap, in MB.
 * @param {number} [options.maxFiles=10]
 */
function createUploader({ kinds = LESSON_FILE_KINDS, maxSizeMb, maxFiles = 10 } = {}) {
  const limitMb = maxSizeMb || env.UPLOAD_MAX_FILE_SIZE_MB;
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: limitMb * 1024 * 1024,
      files: maxFiles,
      fields: 50,
    },
    fileFilter: buildFileFilter(kinds),
  });
  return tagLimit(instance, limitMb);
}

/** Images only — profile pictures, capped by `UPLOAD_MAX_IMAGE_SIZE_MB`. */
const imageUploader = createUploader({
  kinds: [FILE_KINDS.IMAGE],
  maxSizeMb: env.UPLOAD_MAX_IMAGE_SIZE_MB,
  maxFiles: 1,
});

/** Full document/media/archive whitelist — lessons, homework and attachments. */
const documentUploader = createUploader({ kinds: LESSON_FILE_KINDS });

/**
 * Translate multer's own errors into `ApiError`s so the global handler can
 * render them in the standard envelope.
 * @type {import('express').ErrorRequestHandler}
 */
function handleUploadErrors(error, req, _res, next) {
  if (!(error instanceof multer.MulterError)) return next(error);

  const limitMb = req.uploadMaxSizeMb || env.UPLOAD_MAX_FILE_SIZE_MB;
  const messages = {
    LIMIT_FILE_SIZE: `File exceeds the maximum size of ${limitMb} MB`,
    LIMIT_FILE_COUNT: 'Too many files uploaded',
    LIMIT_UNEXPECTED_FILE: `Unexpected file field "${error.field}"`,
    LIMIT_PART_COUNT: 'Too many parts in the multipart payload',
  };

  const message = messages[error.code] || `File upload error: ${error.message}`;
  const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  return next(new ApiError(statusCode, message, { code: error.code }));
}

module.exports = {
  createUploader,
  imageUploader,
  documentUploader,
  handleUploadErrors,
};
