'use strict';

const mongoose = require('mongoose');

const env = require('./env');
const logger = require('./logger');

// Reject writes that reference undefined schema paths instead of dropping them.
mongoose.set('strictQuery', true);
if (env.isDevelopment) {
  mongoose.set('debug', env.LOG_LEVEL === 'debug');
}

/** Reuse one connection across warm serverless invocations (e.g. Vercel). */
let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

function registerConnectionListeners() {
  if (registerConnectionListeners.registered) return;
  registerConnectionListeners.registered = true;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) =>
    logger.error('MongoDB error', { error: error.message })
  );
}

/**
 * Establish the MongoDB connection.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase() {
  registerConnectionListeners();

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: env.isVercel ? 10 : 20,
        minPoolSize: env.isVercel ? 1 : 2,
        autoIndex: !env.isProduction, // build indexes explicitly in production
      })
      .then((connection) => {
        cached.conn = connection;
        return connection;
      })
      .catch((error) => {
        cached.promise = null;
        throw error;
      });
  }

  return cached.promise;
}

/** Close the connection cleanly (used on shutdown and in tests). */
async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;

  await mongoose.connection.close(false);
  cached.conn = null;
  cached.promise = null;
  logger.info('MongoDB connection closed');
}

module.exports = { connectDatabase, disconnectDatabase, mongoose };
