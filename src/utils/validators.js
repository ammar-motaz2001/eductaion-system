'use strict';

/**
 * Reusable Zod fragments.
 *
 * Keeping primitives here means every module validates an ObjectId, a phone
 * number or a pagination block the same way, and error messages stay
 * consistent across the API surface.
 */

const mongoose = require('mongoose');
const { z } = require('zod');

const { PAGINATION } = require('../core/constants');

/** A 24-character hex Mongo ObjectId. */
const objectId = z
  .string()
  .trim()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: 'Must be a valid 24-character ObjectId',
  });

/** E.164-ish phone number: optional `+`, 7–15 digits, separators tolerated. */
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => /^\+?\d{7,15}$/.test(value), {
    message: 'Must be a valid phone number (7–15 digits, optional leading +)',
  });

const email = z.string().trim().toLowerCase().email('Must be a valid email address');

/**
 * Password policy: at least 8 characters with an uppercase letter, a lowercase
 * letter and a digit.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value), { message: 'Password must contain a lowercase letter' })
  .refine((value) => /[A-Z]/.test(value), { message: 'Password must contain an uppercase letter' })
  .refine((value) => /\d/.test(value), { message: 'Password must contain a digit' });

/** Human name or display handle: letters, numbers, spaces, apostrophes, hyphens, underscores and dots. */
const personName = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name must be at most 120 characters')
  .refine((value) => /^[\p{L}\p{M}\d\s'.-_]+$/u.test(value), {
    message:
      'Name may only contain letters, numbers, spaces, apostrophes, hyphens, underscores and dots',
  });

/** Treat empty multipart text fields as absent so optional Zod keys pass. */
const emptyToUndefined = (schema) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema);

/** ISO-8601 date string or timestamp, coerced to a `Date`. */
const isoDate = z.coerce.date({
  errorMap: () => ({ message: 'Must be a valid ISO-8601 date' }),
});

/** Non-negative monetary amount, rounded to two decimals. */
const money = z.coerce
  .number()
  .min(0, 'Amount cannot be negative')
  .max(1_000_000_000, 'Amount is unrealistically large')
  .transform((value) => Math.round(value * 100) / 100);

const shortText = (max = 255) => z.string().trim().max(max, `Must be at most ${max} characters`);
const longText = (max = 5000) => z.string().trim().max(max, `Must be at most ${max} characters`);

/** Standard list-endpoint query parameters. Extra keys are preserved for filters. */
const paginationQuery = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.MAX_LIMIT)
      .optional()
      .default(PAGINATION.DEFAULT_LIMIT),
    sort: z.string().trim().max(200).optional(),
    search: z.string().trim().max(200).optional(),
    fields: z.string().trim().max(500).optional(),
    includeDeleted: z.enum(['true', 'false']).optional(),
  })
  .passthrough();

/** `{ id }` path parameter validator, reused by nearly every route. */
const idParams = z.object({ id: objectId });

/**
 * Wrap a list-query filter so it accepts both forms the query builder understands:
 * a bare value (`?status=active`) and an operator document (`?score[gte]=50`,
 * `?examType[in]=quiz,midterm`).
 *
 * Without this a strict enum or ObjectId validator would reject the operator
 * form outright, before the query builder ever saw it.
 *
 * @param {import('zod').ZodTypeAny} [schema] Validator for the bare form.
 */
const filterValue = (schema = z.string()) =>
  z.union([schema, z.record(z.string(), z.string())]).optional();

/** Reject payloads with no updatable keys so a PATCH cannot silently no-op. */
const nonEmptyObject = (schema) =>
  schema.refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

module.exports = {
  z,
  objectId,
  phone,
  email,
  password,
  personName,
  isoDate,
  money,
  shortText,
  longText,
  paginationQuery,
  idParams,
  filterValue,
  nonEmptyObject,
  emptyToUndefined,
};
