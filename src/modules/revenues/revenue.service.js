'use strict';

const TransactionService = require('../finance/TransactionService');
const { TRANSACTION_CATEGORIES } = require('../../core/constants');
const revenueRepository = require('./revenue.repository');

module.exports = new TransactionService(revenueRepository, {
  resourceName: 'Revenue entry',
  categories: TRANSACTION_CATEGORIES.REVENUE,
});
