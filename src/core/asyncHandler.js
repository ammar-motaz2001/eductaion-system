'use strict';

/**
 * Wrap an async route handler so rejected promises reach Express' error
 * pipeline instead of becoming unhandled rejections.
 *
 * @param {import('express').RequestHandler} handler
 * @returns {import('express').RequestHandler}
 */
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = asyncHandler;
