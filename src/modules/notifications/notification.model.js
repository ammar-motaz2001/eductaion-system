'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');
const { NOTIFICATION_TYPES, NOTIFICATION_SEVERITY } = require('../../core/constants');

/**
 * In-app notification addressed to a specific user.
 *
 * `dedupeKey` makes generation idempotent: recurring rules (attendance
 * warnings, late-payment alerts) upsert on this key so re-running a rule
 * refreshes the existing notification instead of flooding the inbox.
 */
const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: Object.values(NOTIFICATION_SEVERITY),
      default: NOTIFICATION_SEVERITY.INFO,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },

    /** Loose reference to the record that triggered the notification. */
    resource: {
      model: { type: String, trim: true, default: null },
      id: { type: Schema.Types.ObjectId, default: null },
    },
    /** Arbitrary payload for the client (e.g. the computed percentage). */
    data: { type: Schema.Types.Mixed, default: {} },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    dedupeKey: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(notificationSchema);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
// One live notification per logical event per recipient.
notificationSchema.index(
  { recipient: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
