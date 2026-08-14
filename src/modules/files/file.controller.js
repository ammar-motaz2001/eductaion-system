'use strict';

const path = require('path');
const fs = require('fs');

const ApiError = require('../../core/ApiError');
const asyncHandler = require('../../core/asyncHandler');
const storageService = require('../../services/storage');
const { resolveFileKind } = require('../../utils/file.util');

/**
 * Serve a stored file by its storage key.
 *
 * Every uploaded file — profile images, lesson material, homework attachments —
 * records a `key` alongside its URL. This endpoint turns that key back into
 * bytes, so a client that only holds the key (or a relative URL) can display or
 * download the file through the authenticated API rather than depending on the
 * public static mount.
 *
 * Local storage streams the file; a cloud provider gets a redirect to its URL.
 */

/** Guess the content type from the extension, for drivers that do not store it. */
const CONTENT_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
});

/**
 * Serve the file identified by the wildcard portion of the path.
 *
 * `?download=true` forces a save dialog; the default renders inline so the URL
 * can be used directly as an `<img>`/`<embed>` source.
 */
const serve = asyncHandler(async (req, res) => {
  // Everything after `/files/` is the storage key, which may contain slashes.
  const rawKey = req.params[0];
  if (!rawKey) throw ApiError.badRequest('A file key is required');

  const key = decodeURIComponent(rawKey);

  // Reject traversal attempts before they reach the filesystem. The local driver
  // guards this too; failing here keeps the error a clean 400.
  if (key.includes('..') || key.startsWith('/') || key.includes('\0')) {
    throw ApiError.badRequest('Invalid file key');
  }

  const extension = path.extname(key).toLowerCase();
  const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
  const filename = path.basename(key);

  // Cloud providers serve their own bytes — hand the client a redirect.
  if (!storageService.isLocal()) {
    const url = await storageService.getDownloadUrl({
      key,
      kind: resolveFileKind(CONTENT_TYPES[extension], key) || 'other',
    });
    return res.redirect(302, url);
  }

  const absolutePath = storageService.absolutePathFor(key);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    throw ApiError.notFound('File not found');
  }

  const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  // Filenames carry random suffixes, so a stored file is immutable once written.
  res.setHeader('Cache-Control', 'private, max-age=86400');

  return res.sendFile(absolutePath, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  });
});

module.exports = { serve };
