'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = require('../../core/schemas/file.schema');
const { applyBasePlugins } = require('../../core/plugins');

/**
 * Lesson material belonging to a collection: one uploaded file (PDF, image,
 * document, presentation or video) plus its metadata.
 */
const lessonSchema = new Schema(
  {
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    lessonName: { type: String, required: true, trim: true, maxlength: 200, index: true },
    /** Session label within the collection, e.g. "Week 3 – Algebra". */
    className: { type: String, trim: true, maxlength: 150, index: true },
    description: { type: String, trim: true, maxlength: 3000 },

    file: { type: fileSchema, required: true },

    /** Hidden lessons stay invisible to students until published. */
    isPublished: { type: Boolean, default: true, index: true },
    /** Ordering hint for the student-facing lesson list. */
    order: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0, min: 0 },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(lessonSchema);

lessonSchema.index({ collectionId: 1, order: 1, createdAt: -1 });
lessonSchema.index({ lessonName: 'text', className: 'text', description: 'text' });
// Guard against uploading the same lesson name twice within one collection.
lessonSchema.index(
  { collectionId: 1, lessonName: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

module.exports = mongoose.model('Lesson', lessonSchema);
