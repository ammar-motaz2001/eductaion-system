'use strict';

const mongoose = require('mongoose');

const env = require('./env');
const logger = require('./logger');

// Reject writes that reference undefined schema paths instead of dropping them.
mongoose.set('strictQuery', true);
if (env.isDevelopment) {
  mongoose.set('debug', env.LOG_LEVEL === 'debug');
}

/**
 * Establish the MongoDB connection.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase() {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) =>
    logger.error('MongoDB error', { error: error.message })
  );

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
    minPoolSize: 2,
    autoIndex: !env.isProduction, // build indexes explicitly in production
  });

  return mongoose;
}

/** Close the connection cleanly (used on shutdown and in tests). */
async function disconnectDatabase() {
  await mongoose.connection.close(false);
  logger.info('MongoDB connection closed');
}

module.exports = { connectDatabase, disconnectDatabase, mongoose };
