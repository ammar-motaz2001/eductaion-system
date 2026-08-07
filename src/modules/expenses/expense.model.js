'use strict';

const mongoose = require('mongoose');

const createTransactionSchema = require('../../core/schemas/transaction.schema');
const { TRANSACTION_CATEGORIES } = require('../../core/constants');

/** Outgoing ledger: rent, salaries, utilities, equipment, marketing, upkeep. */
const expenseSchema = createTransactionSchema({
  categories: TRANSACTION_CATEGORIES.EXPENSE,
  kind: 'expense',
});

module.exports = mongoose.model('Expense', expenseSchema);
