'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');
const { EDUCATION_LEVELS, WEEK_DAYS } = require('../../core/constants');

/**
 * One recurring session in a collection's weekly timetable.
 * Times are stored as `HH:mm` strings in the institution's local time; storing
 * them as wall-clock avoids DST drift for a schedule that means "every Monday
 * at 4pm" regardless of offset changes.
 */
const scheduleSlotSchema = new Schema(
  {
    day: { type: String, enum: WEEK_DAYS, required: true },
    startTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be in HH:mm 24-hour format'],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be in HH:mm 24-hour format'],
    },
    room: { type: String, trim: true, maxlength: 60 },
  },
  { _id: false }
);

/** Reject slots that end before they start. */
scheduleSlotSchema.pre('validate', function validateSlot(next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    return next(new Error('Schedule endTime must be later than startTime'));
  }
  return next();
});

/**
 * A Collection is a teaching group: a subject taught to a given education level
 * on a fixed weekly schedule, with its own pricing.
 */
const collectionSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Collection name is required'],
      trim: true,
      maxlength: 150,
      index: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 100, index: true },
    educationLevel: { type: String, enum: EDUCATION_LEVELS, required: true, index: true },

    pricePerClass: { type: Number, required: true, min: 0, default: 0 },
    monthlySubscriptionPrice: { type: Number, required: true, min: 0, default: 0 },

    schedule: { type: [scheduleSlotSchema], default: [] },
    description: { type: String, trim: true, maxlength: 3000 },

    /** Optional cap; `null` means unlimited. */
    capacity: { type: Number, min: 1, default: null },
    isActive: { type: Boolean, default: true, index: true },

    /** Denormalised enrolment counter, maintained by the enrolment service. */
    studentsCount: { type: Number, default: 0, min: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(collectionSchema);

// A given subject/level pair may exist only once under the same name.
collectionSchema.index(
  { name: 1, subject: 1, educationLevel: 1, deletedAt: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
collectionSchema.index({ subject: 'text', name: 'text', description: 'text' });
collectionSchema.index({ educationLevel: 1, isActive: 1, deletedAt: 1 });

/** True when the collection has reached its declared capacity. */
collectionSchema.virtual('isFull').get(function isFull() {
  return this.capacity !== null && this.studentsCount >= this.capacity;
});

module.exports = mongoose.model('Collection', collectionSchema);
