'use strict';

const mongoose = require('mongoose');

const httpStatus = require('./httpStatus');

/** Internal fields that must never reach a client. */
const HIDDEN_FIELDS = Object.freeze(['__v', 'deletedAt', 'deletedBy']);

/**
 * Normalise a payload for transport.
 *
 * The `toJSON` plugin renames `_id` to `id` and strips internal fields, but it
 * only runs on hydrated Mongoose documents — and repository reads use `.lean()`
 * for speed, which bypasses it entirely. Applying the same shape here, at the
 * presentation boundary, means list and single-document endpoints agree on their
 * output while service code keeps working with `_id` internally.
 *
 * @param {*} value
 * @returns {*}
 */
function serialize(value) {
  if (value === null || value === undefined) return value;

  // Hydrated documents already have a correct transform — use it, then continue
  // so any lean sub-objects nested inside are normalised too.
  if (value instanceof mongoose.Document) return serialize(value.toJSON());

  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (HIDDEN_FIELDS.includes(key)) continue;
    if (key === '_id') {
      output.id = nested === null || nested === undefined ? nested : String(nested);
      continue;
    }
    output[key] = serialize(nested);
  }
  return output;
}

/**
 * Standard JSON response envelope.
 *
 * Every successful response has the shape:
 * `{ success: true, message, data, meta?, timestamp }`
 *
 * Errors use the same envelope with `success: false` and an `error` object,
 * produced by the global error handler.
 */
class ApiResponse {
  /**
   * @param {import('express').Response} res
   * @param {object} [options]
   * @param {number} [options.statusCode=200]
   * @param {string} [options.message='Success']
   * @param {*} [options.data=null]
   * @param {object|null} [options.meta=null] Pagination or aggregate metadata.
   */
  static send(
    res,
    { statusCode = httpStatus.OK, message = 'Success', data = null, meta = null } = {}
  ) {
    const body = {
      success: true,
      message,
      data: serialize(data),
      timestamp: new Date().toISOString(),
    };
    if (meta) body.meta = meta;
    return res.status(statusCode).json(body);
  }

  static ok(res, data = null, message = 'Success', meta = null) {
    return ApiResponse.send(res, { statusCode: httpStatus.OK, message, data, meta });
  }

  static created(res, data = null, message = 'Resource created successfully') {
    return ApiResponse.send(res, { statusCode: httpStatus.CREATED, message, data });
  }

  static noContent(res) {
    return res.status(httpStatus.NO_CONTENT).send();
  }

  /**
   * Send a paginated list. `page` is the object returned by the query builder.
   * @param {import('express').Response} res
   * @param {{items: Array, meta: object}} page
   */
  static paginated(res, page, message = 'Success') {
    return ApiResponse.send(res, {
      statusCode: httpStatus.OK,
      message,
      data: page.items,
      meta: page.meta,
    });
  }
}

module.exports = ApiResponse;
module.exports.serialize = serialize;
