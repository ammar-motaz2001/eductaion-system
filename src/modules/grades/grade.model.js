'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');
const { EXAM_TYPES } = require('../../core/constants');

/**
 * A single assessment result for a student in a collection.
 */
const gradeSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    examType: {
      type: String,
      enum: Object.values(EXAM_TYPES),
      required: true,
      index: true,
    },
    /** Free-text label, e.g. "Unit 4 quiz" — useful when several quizzes exist. */
    title: { type: String, trim: true, maxlength: 200 },
    examDate: { type: Date, required: true, index: true },

    score: { type: Number, required: true, min: 0 },
    totalScore: { type: Number, required: true, min: 1 },

    /** Optional link to the assignment this grade scores. */
    homework: { type: Schema.Types.ObjectId, ref: 'Homework', default: null },
    notes: { type: String, trim: true, maxlength: 1000 },

    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(gradeSchema);

gradeSchema.index({ student: 1, collectionId: 1, examDate: -1 });
gradeSchema.index({ collectionId: 1, examType: 1, examDate: -1 });
gradeSchema.index({ title: 'text', notes: 'text' });

/** A score above its own maximum is a data-entry error, not a valid record. */
gradeSchema.pre('validate', function validateScore(next) {
  if (this.score != null && this.totalScore != null && this.score > this.totalScore) {
    return next(new Error('score cannot exceed totalScore'));
  }
  return next();
});

gradeSchema.virtual('percentage').get(function percentage() {
  if (!this.totalScore) return 0;
  return Math.round((this.score / this.totalScore) * 10000) / 100;
});

module.exports = mongoose.model('Grade', gradeSchema);
