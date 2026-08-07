'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = require('../../core/schemas/file.schema');
const { applyBasePlugins } = require('../../core/plugins');

/**
 * An assignment issued to every student in a collection.
 * Grades for submitted homework are recorded through the Grades module using
 * exam type `homework`, which keeps all scoring in one place.
 */
const homeworkSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, index: true },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 5000 },
    dueDate: { type: Date, required: true, index: true },

    attachments: { type: [fileSchema], default: [] },

    /** Optional maximum score, used when grading this assignment. */
    totalScore: { type: Number, min: 0, default: null },
    isPublished: { type: Boolean, default: true, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(homeworkSchema);

homeworkSchema.index({ collectionId: 1, dueDate: -1 });
homeworkSchema.index({ title: 'text', description: 'text' });

/** True once the due date has passed. */
homeworkSchema.virtual('isOverdue').get(function isOverdue() {
  return this.dueDate instanceof Date && this.dueDate.getTime() < Date.now();
});

module.exports = mongoose.model('Homework', homeworkSchema);
