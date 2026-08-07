'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = require('../../core/schemas/file.schema');
const { applyBasePlugins } = require('../../core/plugins');
const {
  STUDENT_STATUS,
  EDUCATION_LEVELS,
  PERFORMANCE_LEVELS,
  PAYMENT_STATUS,
} = require('../../core/constants');

/** Instructor-authored remark attached to a student's record. */
const noteSchema = new Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const addressSchema = new Schema(
  {
    line: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 80 },
    governorate: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80, default: 'Egypt' },
  },
  { _id: false }
);

/**
 * Student profile.
 *
 * Separated from `User` so authentication stays minimal while the academic
 * profile grows freely. `fullName`, `email` and `phone` are intentionally
 * denormalised from the linked user: student search, sorting and reporting all
 * run against this collection, and a `$lookup` on every list query would be the
 * dominant cost. The student service is the single writer that keeps the two in
 * sync.
 */
const studentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // ── Personal information ────────────────────────────────────────────────
    fullName: { type: String, required: true, trim: true, maxlength: 120, index: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    age: { type: Number, min: 3, max: 100 },
    phone: { type: String, trim: true, maxlength: 20, index: true },
    parentPhone: { type: String, trim: true, maxlength: 20 },
    educationLevel: { type: String, enum: EDUCATION_LEVELS, required: true, index: true },
    school: { type: String, trim: true, maxlength: 150, index: true },
    address: { type: addressSchema, default: () => ({}) },
    profileImage: { type: fileSchema, default: null },
    status: {
      type: String,
      enum: Object.values(STUDENT_STATUS),
      default: STUDENT_STATUS.PENDING,
      index: true,
    },

    // ── Academic information ────────────────────────────────────────────────
    /** Instructor's qualitative assessment. */
    performance: {
      type: String,
      enum: Object.values(PERFORMANCE_LEVELS),
      default: PERFORMANCE_LEVELS.AVERAGE,
      index: true,
    },
    notes: { type: [noteSchema], default: [] },

    /**
     * Attendance and payment roll-ups.
     *
     * Cached because the dashboard, student list and warning rule all read them
     * on every request; recomputed by the attendance/payment services whenever
     * an underlying record changes.
     */
    attendancePercentage: { type: Number, default: 0, min: 0, max: 100, index: true },
    totalPresent: { type: Number, default: 0, min: 0 },
    totalAbsent: { type: Number, default: 0, min: 0 },
    totalSessions: { type: Number, default: 0, min: 0 },

    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    outstandingBalance: { type: Number, default: 0, min: 0 },

    /**
     * Cached list of enrolled collection ids. `CollectionStudent` remains the
     * source of truth (it carries enrolment metadata); this array exists so
     * "filter students by collection" is a single indexed query.
     */
    collections: [{ type: Schema.Types.ObjectId, ref: 'Collection', index: true }],

    /** Activation code redeemed at registration, kept for audit purposes. */
    activationCode: { type: Schema.Types.ObjectId, ref: 'ActivationCode', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    enrolledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

applyBasePlugins(studentSchema);

studentSchema.index({ fullName: 'text', school: 'text', email: 'text' });
studentSchema.index({ status: 1, educationLevel: 1, deletedAt: 1 });
studentSchema.index({ collections: 1, status: 1 });
studentSchema.index({ attendancePercentage: 1, status: 1 });

/** Convenience flag used by the attendance-warning rule and the dashboard. */
studentSchema.virtual('hasAttendanceWarning').get(function hasAttendanceWarning() {
  const threshold = Number(process.env.ATTENDANCE_WARNING_THRESHOLD || 50);
  return this.totalSessions > 0 && this.attendancePercentage < threshold;
});

module.exports = mongoose.model('Student', studentSchema);
