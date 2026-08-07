'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');
const { ATTENDANCE_STATUS } = require('../../core/constants');

/**
 * One attendance record per student, per collection, per day.
 *
 * Workflow: a student submits attendance (`pending`) and the instructor then
 * confirms `present` or marks `absent`. Instructors may also record a status
 * directly, skipping the pending step.
 */
const attendanceSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    /**
     * Normalised to midnight UTC by the service layer so that the unique index
     * genuinely means "one record per day".
     */
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.PENDING,
      index: true,
    },

    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

applyBasePlugins(attendanceSchema);

// Prevents duplicate attendance for the same student/collection/day.
attendanceSchema.index(
  { student: 1, collectionId: 1, date: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
attendanceSchema.index({ collectionId: 1, date: -1, status: 1 });
attendanceSchema.index({ status: 1, date: -1 });
attendanceSchema.index({ student: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
