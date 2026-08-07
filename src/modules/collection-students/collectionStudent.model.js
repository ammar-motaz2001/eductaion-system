'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');

/**
 * Enrolment join between a student and a collection.
 *
 * Modelled as its own collection rather than an array on either side because the
 * relationship carries its own data (join date, per-group activity flag) and
 * because either side can grow without bound.
 */
const collectionStudentSchema = new Schema(
  {
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    /** Denormalised for sorting/searching enrolment lists without a `$lookup`. */
    studentName: { type: String, trim: true, maxlength: 120, index: true },

    enrolledAt: { type: Date, default: Date.now },
    /** Set false to suspend a student inside one group without unenrolling. */
    isActive: { type: Boolean, default: true, index: true },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

applyBasePlugins(collectionStudentSchema);

// A student may appear in a collection at most once (ignoring tombstones).
collectionStudentSchema.index(
  { collectionId: 1, student: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
collectionStudentSchema.index({ collectionId: 1, isActive: 1, deletedAt: 1 });
collectionStudentSchema.index({ student: 1, isActive: 1, deletedAt: 1 });

module.exports = mongoose.model('CollectionStudent', collectionStudentSchema);
