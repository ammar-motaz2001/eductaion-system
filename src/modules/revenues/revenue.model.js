'use strict';

const mongoose = require('mongoose');

const createTransactionSchema = require('../../core/schemas/transaction.schema');
const { TRANSACTION_CATEGORIES } = require('../../core/constants');

/** Income ledger: tuition, subscriptions, book sales, exam fees, donations. */
const revenueSchema = createTransactionSchema({
  categories: TRANSACTION_CATEGORIES.REVENUE,
  kind: 'revenue',
});

module.exports = mongoose.model('Revenue', revenueSchema);
