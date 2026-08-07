'use strict';

const mongoose = require('mongoose');
const { ZodError } = require('zod');

const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../core/ApiError');
const httpStatus = require('../core/httpStatus');

/**
 * Convert any thrown value into an `ApiError`.
 *
 * Framework- and driver-specific failures are mapped to meaningful HTTP
 * semantics here so that no handler needs to know about Mongoose internals.
 */
function normalizeError(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validation(
      'Request validation failed',
      error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }

  // Mongoose schema validation
  if (error instanceof mongoose.Error.ValidationError) {
    return ApiError.validation(
      'Document validation failed',
      Object.values(error.errors).map((fieldError) => ({
        field: fieldError.path,
        message: fieldError.message,
      }))
    );
  }

  // Malformed ObjectId or wrong type for a path
  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${error.path}": ${error.value}`, {
      code: 'INVALID_IDENTIFIER',
    });
  }

  if (error instanceof mongoose.Error.DocumentNotFoundError) {
    return ApiError.notFound('Resource not found');
  }

  // Duplicate key — surface which field collided.
  if (error?.code === 11000 || error?.code === 11001) {
    const fields = Object.keys(error.keyPattern || error.keyValue || {});
    const label = fields.length ? fields.join(', ') : 'field';
    return ApiError.conflict(`A record with this ${label} already exists`, {
      code: 'DUPLICATE_KEY',
      errors: fields.map((field) => ({
        field,
        message: `"${error.keyValue?.[field]}" is already in use`,
      })),
    });
  }

  // Body parser
  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }
  if (error?.type === 'entity.too.large') {
    return new ApiError(httpStatus.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }

  if (error?.name === 'MongoServerSelectionError' || error?.name === 'MongoNetworkError') {
    return new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Database is temporarily unavailable', {
      isOperational: false,
    });
  }

  return ApiError.internal(error?.message || 'Internal server error');
}

/**
 * Terminal error handler. Must be registered last.
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const apiError = normalizeError(error);

  const context = {
    method: req.method,
    path: req.originalUrl,
    statusCode: apiError.statusCode,
    code: apiError.code,
    requestId: req.id,
    userId: req.user?.id,
  };

  if (apiError.statusCode >= 500 || !apiError.isOperational) {
    logger.error(apiError.message, { ...context, stack: error.stack });
  } else {
    logger.warn(apiError.message, context);
  }

  const body = {
    success: false,
    message:
      // Never leak internals of an unexpected failure to clients in production.
      env.isProduction && (!apiError.isOperational || apiError.statusCode >= 500)
        ? 'Something went wrong. Please try again later.'
        : apiError.message,
    error: {
      code: apiError.code,
      statusCode: apiError.statusCode,
      ...(apiError.errors?.length ? { details: apiError.errors } : {}),
    },
    timestamp: new Date().toISOString(),
  };

  if (!env.isProduction) {
    body.error.stack = error.stack;
  }

  return res.status(apiError.statusCode).json(body);
}

/**
 * 404 fallback for unmatched routes.
 * @type {import('express').RequestHandler}
 */
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

module.exports = { errorHandler, notFoundHandler, normalizeError };
