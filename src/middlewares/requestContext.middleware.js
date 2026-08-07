'use strict';

const crypto = require('crypto');

/**
 * Attach a correlation id to every request and echo it back as
 * `X-Request-Id`, so a client-reported failure can be traced in the logs.
 *
 * @type {import('express').RequestHandler}
 */
function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.startedAt = process.hrtime.bigint();
  next();
}

module.exports = requestContext;
