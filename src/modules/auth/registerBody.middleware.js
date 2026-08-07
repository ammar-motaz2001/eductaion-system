'use strict';

/** Fields accepted by POST /auth/register — everything else is stripped. */
const REGISTER_FIELDS = new Set([
  'activationCode',
  'fullName',
  'email',
  'password',
  'phone',
  'parentPhone',
  'age',
  'educationLevel',
  'school',
  'address',
]);

/**
 * Remove client-only fields (e.g. confirmPassword, Next.js $ACTION_* keys)
 * before Zod validation runs.
 * @type {import('express').RequestHandler}
 */
function stripRegisterBody(req, _res, next) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => REGISTER_FIELDS.has(key))
    );
  }
  return next();
}

module.exports = stripRegisterBody;
