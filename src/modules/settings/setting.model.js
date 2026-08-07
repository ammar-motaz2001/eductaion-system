'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');

/**
 * Per-user preferences and institution-level configuration.
 *
 * Instructor identity fields (name, email, phone, photo, password) live on
 * `User`; this collection holds everything that is a *preference* rather than an
 * identity, keyed one-to-one by owner.
 */
const settingSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

    /** Institution details, shown on generated report PDFs. */
    institution: {
      name: { type: String, trim: true, maxlength: 150, default: '' },
      addressLine: { type: String, trim: true, maxlength: 200, default: '' },
      contactPhone: { type: String, trim: true, maxlength: 20, default: '' },
      contactEmail: { type: String, trim: true, lowercase: true, maxlength: 150, default: '' },
    },

    preferences: {
      locale: { type: String, trim: true, maxlength: 10, default: 'en' },
      timezone: { type: String, trim: true, maxlength: 60, default: 'Africa/Cairo' },
      currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: 'EGP' },
      /** Attendance percentage below which a warning is raised. */
      attendanceWarningThreshold: { type: Number, min: 0, max: 100, default: 50 },
      /** Days after the due date before a payment is flagged late. */
      paymentGracePeriodDays: { type: Number, min: 0, max: 90, default: 0 },
    },

    notificationPreferences: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      attendanceWarnings: { type: Boolean, default: true },
      latePayments: { type: Boolean, default: true },
      pendingApprovals: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

applyBasePlugins(settingSchema, { softDelete: false });

module.exports = mongoose.model('Setting', settingSchema);
