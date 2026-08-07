'use strict';

const ApiError = require('../core/ApiError');

/**
 * Zod-backed request validation.
 *
 * Validated (and coerced) values replace the raw request properties so
 * downstream handlers always receive parsed, trimmed, correctly-typed input.
 *
 * @param {{body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny}} schemas
 * @returns {import('express').RequestHandler}
 */
function validate(schemas = {}) {
  return (req, _res, next) => {
    const issues = [];

    for (const source of ['params', 'query', 'body']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (result.success) {
        // `req.query` is a getter on newer Express versions; assign defensively.
        try {
          req[source] = result.data;
        } catch {
          Object.defineProperty(req, source, { value: result.data, writable: true });
        }
        continue;
      }

      issues.push(
        ...result.error.issues.map((issue) => ({
          field: [source, ...issue.path].join('.').replace(/^body\./, ''),
          message: issue.message,
          code: issue.code,
        }))
      );
    }

    if (issues.length) {
      return next(ApiError.validation('Request validation failed', issues));
    }
    return next();
  };
}

module.exports = validate;
