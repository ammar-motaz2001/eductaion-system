'use strict';

const rateLimit = require('express-rate-limit');

const env = require('../config/env');
const ApiError = require('../core/ApiError');

/**
 * Rate limiters.
 *
 * The default in-memory store is per-process; behind multiple instances swap in
 * a shared store (e.g. `rate-limit-redis`) without changing call sites.
 */

/** Route limits through the standard error envelope. */
function limitHandler(_req, _res, next) {
  next(ApiError.tooManyRequests('Too many requests — please try again later'));
}

const baseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitHandler,
  // Skip limiting in tests so suites are not throttled.
  skip: () => env.isTest,
};

/** Global limiter applied to the whole API surface. */
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.rateLimitWindowMs,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
});

/**
 * Stricter limiter for credential endpoints (login, refresh, password reset)
 * to blunt brute-force and enumeration attempts.
 */
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.rateLimitWindowMs,
  limit: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  // Key on email when supplied so one abusive account cannot lock out a shared NAT.
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${req.ip}|${email}`;
  },
});

/** Very tight limiter for expensive write paths such as large uploads. */
const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 30,
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
