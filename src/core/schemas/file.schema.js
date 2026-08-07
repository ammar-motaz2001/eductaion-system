'use strict';

const { Schema } = require('mongoose');

const { FILE_KINDS } = require('../constants');

/**
 * Embedded descriptor for a file held by an external storage provider.
 *
 * Stored as a sub-document (rather than a separate collection) because a file
 * has no independent lifecycle — it lives and dies with its parent record.
 */
const fileSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true, default: 'local' },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    kind: { type: String, enum: Object.values(FILE_KINDS), default: FILE_KINDS.OTHER },
    /** Cloudinary-specific resource_type, retained so deletes target the right API. */
    resourceType: { type: String, trim: true },
  },
  { _id: false, timestamps: false }
);

module.exports = fileSchema;
