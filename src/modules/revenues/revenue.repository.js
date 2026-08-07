'use strict';

const TransactionRepository = require('../finance/TransactionRepository');
const Revenue = require('./revenue.model');

module.exports = new TransactionRepository(Revenue);
