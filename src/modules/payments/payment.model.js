'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { applyBasePlugins } = require('../../core/plugins');
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('../../core/constants');

/**
 * A billable item owed by a student for a collection (monthly subscription,
 * per-class fee, exam fee, …).
 */
const paymentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: 'EGP' },

    dueDate: { type: Date, required: true, index: true },
    paidDate: { type: Date, default: null, index: true },

    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },

    /** Free-text label such as "March 2026 subscription". */
    description: { type: String, trim: true, maxlength: 300 },
    reference: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 1000 },

    /** Set when marking as paid creates a matching revenue entry. */
    revenue: { type: Schema.Types.ObjectId, ref: 'Revenue', default: null },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(paymentSchema);

paymentSchema.index({ student: 1, dueDate: -1 });
paymentSchema.index({ status: 1, dueDate: 1 });
paymentSchema.index({ collectionId: 1, status: 1, dueDate: -1 });
paymentSchema.index({ description: 'text', reference: 'text' });

/**
 * Keep `status` and `paidDate` mutually consistent, and derive `late` for
 * unpaid items whose due date has passed. Only touched on document `save`;
 * bulk sweeps use the payment service's `refreshOverdueStatuses`.
 */
paymentSchema.pre('save', function syncStatus(next) {
  if (this.status === PAYMENT_STATUS.PAID) {
    if (!this.paidDate) this.paidDate = new Date();
  } else {
    this.paidDate = null;
    if (this.dueDate && this.dueDate.getTime() < Date.now()) {
      this.status = PAYMENT_STATUS.LATE;
    }
  }
  return next();
});

/** Whole days past the due date; `0` when not overdue. */
paymentSchema.virtual('daysOverdue').get(function daysOverdue() {
  if (this.status === PAYMENT_STATUS.PAID || !this.dueDate) return 0;
  const diff = Date.now() - this.dueDate.getTime();
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
});

module.exports = mongoose.model('Payment', paymentSchema);
