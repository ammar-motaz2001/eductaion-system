'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = require('../../core/schemas/file.schema');
const { applyBasePlugins } = require('../../core/plugins');

/**
 * General-purpose file attached to a collection — syllabi, permission slips,
 * reference sheets. Distinct from `Lesson` (teaching material with an ordered
 * curriculum position) and from `Homework.attachments` (files scoped to one
 * assignment).
 */
const attachmentSchema = new Schema(
  {
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    file: { type: fileSchema, required: true },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Explicit upload timestamp; `createdAt` can shift if records are migrated. */
    uploadDate: { type: Date, default: Date.now, index: true },

    /** Whether students in the collection may see this file. */
    isVisibleToStudents: { type: Boolean, default: true, index: true },
    downloadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

applyBasePlugins(attachmentSchema);

attachmentSchema.index({ collectionId: 1, uploadDate: -1 });
attachmentSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Attachment', attachmentSchema);
