'use strict';

const { Schema } = require('mongoose');

const { applyBasePlugins } = require('../plugins');

/**
 * Factory for the two financial ledgers.
 *
 * Revenue and Expense are structurally identical and differ only in their
 * category vocabulary, so they share one schema definition — a change to how
 * money is recorded cannot drift between the two ledgers.
 *
 * @param {object} options
 * @param {string[]} options.categories Allowed category values.
 * @param {'revenue'|'expense'} options.kind
 * @returns {import('mongoose').Schema}
 */
function createTransactionSchema({ categories, kind }) {
  const schema = new Schema(
    {
      title: { type: String, required: true, trim: true, maxlength: 200, index: true },
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: 'EGP' },
      category: { type: String, enum: categories, required: true, index: true },
      date: { type: Date, required: true, default: Date.now, index: true },
      notes: { type: String, trim: true, maxlength: 2000 },

      /** Set when the entry was generated automatically from a student payment. */
      payment: { type: Schema.Types.ObjectId, ref: 'Payment', default: null, index: true },
      student: { type: Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
      collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', default: null, index: true },

      createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    },
    { timestamps: true }
  );

  applyBasePlugins(schema);

  // Supports the monthly aggregation and the "recent entries" listing.
  schema.index({ date: -1, category: 1, deletedAt: 1 });
  schema.index({ title: 'text', notes: 'text' });

  schema.virtual('ledger').get(() => kind);

  return schema;
}

module.exports = createTransactionSchema;
