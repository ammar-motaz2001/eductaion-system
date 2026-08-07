'use strict';

const TransactionRepository = require('../finance/TransactionRepository');
const Expense = require('./expense.model');

module.exports = new TransactionRepository(Expense);
