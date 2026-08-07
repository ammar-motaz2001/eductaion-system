'use strict';

const TransactionService = require('../finance/TransactionService');
const { TRANSACTION_CATEGORIES } = require('../../core/constants');
const expenseRepository = require('./expense.repository');

module.exports = new TransactionService(expenseRepository, {
  resourceName: 'Expense entry',
  categories: TRANSACTION_CATEGORIES.EXPENSE,
});
