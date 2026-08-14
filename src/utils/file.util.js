'use strict';

const path = require('path');
const crypto = require('crypto');

const { FILE_KINDS } = require('../core/constants');

/**
 * MIME whitelist for uploads, grouped by the logical kind we store on the
 * document. Extensions are checked alongside MIME types because browsers and
 * proxies are inconsistent about Office formats.
 */
const MIME_GROUPS = Object.freeze({
  [FILE_KINDS.PDF]: {
    mimes: ['application/pdf'],
    extensions: ['.pdf'],
  },
  [FILE_KINDS.IMAGE]: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'],
  },
  [FILE_KINDS.DOCUMENT]: {
    mimes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf',
      'text/plain',
    ],
    extensions: ['.doc', '.docx', '.rtf', '.txt'],
  },
  [FILE_KINDS.PRESENTATION]: {
    mimes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    extensions: ['.ppt', '.pptx'],
  },
  [FILE_KINDS.SPREADSHEET]: {
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
    extensions: ['.xls', '.xlsx', '.csv'],
  },
  [FILE_KINDS.VIDEO]: {
    mimes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'],
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
  },
  [FILE_KINDS.ARCHIVE]: {
    // Archive MIME types are the least consistent of all: the same .zip is sent
    // as `application/zip`, `application/x-zip-compressed` or `multipart/x-zip`
    // depending on the client and OS, so the extension carries most of the
    // weight here (see `GENERIC_MIMES` below).
    mimes: [
      'application/zip',
      'application/x-zip-compressed',
      'multipart/x-zip',
      'application/vnd.rar',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-gzip',
      'application/x-bzip2',
      'application/x-compressed',
      'application/x-compressed-tar',
    ],
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2'],
  },
});

/**
 * MIME types clients send when they cannot identify the file. For these the
 * extension is trusted instead — common for Office documents and archives.
 */
const GENERIC_MIMES = Object.freeze([
  '',
  'application/octet-stream',
  'application/binary',
  'binary/octet-stream',
]);

/** Kinds accepted for lesson material and generic attachments. */
const LESSON_FILE_KINDS = [
  FILE_KINDS.PDF,
  FILE_KINDS.IMAGE,
  FILE_KINDS.DOCUMENT,
  FILE_KINDS.PRESENTATION,
  FILE_KINDS.SPREADSHEET,
  FILE_KINDS.VIDEO,
  FILE_KINDS.ARCHIVE,
];

/** Resolve which logical kind a file belongs to, or `null` when disallowed. */
function resolveFileKind(mimetype, originalName) {
  const extension = path.extname(originalName || '').toLowerCase();
  const normalizedMime = (mimetype || '').toLowerCase().split(';')[0].trim();
  const mimeIsGeneric = GENERIC_MIMES.includes(normalizedMime);
  for (const [kind, group] of Object.entries(MIME_GROUPS)) {
    const mimeMatches = group.mimes.includes(normalizedMime);
    const extensionMatches = Boolean(extension) && group.extensions.includes(extension);
    // Require the MIME type to match; the extension acts as a secondary signal
    // for Office documents and archives that clients send as octet-stream.
    if (mimeMatches || (mimeIsGeneric && extensionMatches)) {
      return kind;
    }
  }
  return null;
}

/** Flatten the whitelist for a set of kinds into `{ mimes, extensions }`. */
function allowedFor(kinds) {
  return kinds.reduce(
    (accumulator, kind) => {
      const group = MIME_GROUPS[kind];
      if (group) {
        accumulator.mimes.push(...group.mimes);
        accumulator.extensions.push(...group.extensions);
      }
      return accumulator;
    },
    { mimes: [], extensions: [] }
  );
}

/**
 * Produce a collision-free, path-traversal-safe storage filename.
 */
function buildSafeFilename(originalName) {
  const extension = path.extname(originalName || '').toLowerCase();
  const base = path
    .basename(originalName || 'file', extension)
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'file';
  return `${base}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
}

/** Human-readable byte size, e.g. `2.4 MB`. */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

module.exports = {
  MIME_GROUPS,
  LESSON_FILE_KINDS,
  resolveFileKind,
  allowedFor,
  buildSafeFilename,
  formatBytes,
};
