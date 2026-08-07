'use strict';

const httpStatus = require('./httpStatus');

/**
 * Operational (expected) application error.
 *
 * Anything thrown as an `ApiError` is considered safe to surface to the client;
 * every other thrown value is treated as an unexpected failure by the global
 * error handler and reduced to a generic 500 response.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code.
   * @param {string} message Client-facing message.
   * @param {object} [options]
   * @param {Array<{field: string, message: string}>} [options.errors] Field-level details.
   * @param {string} [options.code] Machine-readable error code.
   * @param {boolean} [options.isOperational]
   */
  constructor(statusCode, message, { errors = [], code, isOperational = true } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code || ApiError.codeFromStatus(statusCode);
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static codeFromStatus(statusCode) {
    const map = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      402: 'PAYMENT_REQUIRED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[statusCode] || 'ERROR';
  }

  static badRequest(message = 'Bad request', options) {
    return new ApiError(httpStatus.BAD_REQUEST, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(httpStatus.UNAUTHORIZED, message, options);
  }

  static forbidden(message = 'You do not have permission to perform this action', options) {
    return new ApiError(httpStatus.FORBIDDEN, message, options);
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(httpStatus.NOT_FOUND, message, options);
  }

  static conflict(message = 'Resource already exists', options) {
    return new ApiError(httpStatus.CONFLICT, message, options);
  }

  static validation(message = 'Validation failed', errors = []) {
    return new ApiError(httpStatus.UNPROCESSABLE_ENTITY, message, { errors });
  }

  static unsupportedMediaType(message = 'Unsupported file type', options) {
    return new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, message, options);
  }

  static tooManyRequests(message = 'Too many requests', options) {
    return new ApiError(httpStatus.TOO_MANY_REQUESTS, message, options);
  }

  static internal(message = 'Internal server error', options) {
    return new ApiError(httpStatus.INTERNAL_SERVER_ERROR, message, {
      ...options,
      isOperational: false,
    });
  }
}

module.exports = ApiError;
