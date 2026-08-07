'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

/** Hash a plaintext password with bcrypt. */
async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Constant-time-ish comparison delegated to bcrypt.
 * @returns {Promise<boolean>}
 */
async function comparePassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword, SALT_ROUNDS };
