'use strict';

const app = require('../src/app');
const { connectDatabase } = require('../src/config/database');

/**
 * Vercel serverless entry point.
 * Connects to MongoDB once per warm instance, then forwards to Express.
 */
module.exports = async (req, res) => {
  await connectDatabase();
  return app(req, res);
};
