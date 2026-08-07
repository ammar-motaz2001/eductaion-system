'use strict';

const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const app = require('./app');

/**
 * Process entry point: connect to MongoDB, start listening, and shut down
 * cleanly on signals so in-flight requests are allowed to finish.
 */

let server;

/** Give in-flight requests a bounded window to complete, then exit. */
async function shutdown(signal, exitCode = 0) {
  logger.info(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed');
    }
    await disconnectDatabase();
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }

  clearTimeout(forceExit);
  process.exit(exitCode);
}

async function start() {
  try {
    await connectDatabase();

    server = app.listen(env.PORT, () => {
      logger.info(`${env.APP_NAME} listening on port ${env.PORT}`, {
        environment: env.NODE_ENV,
        api: `http://localhost:${env.PORT}${env.API_PREFIX}`,
        docs: `http://localhost:${env.PORT}/docs`,
      });
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${env.PORT} is already in use`);
        process.exit(1);
      }
      throw error;
    });
  } catch (error) {
    logger.error('Failed to start the server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// A failed invariant leaves the process in an unknown state; log it and restart
// rather than continuing to serve traffic from a corrupted runtime.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

module.exports = { app, start, shutdown };
