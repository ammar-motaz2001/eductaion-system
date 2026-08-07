'use strict';

/**
 * JWT and opaque-token helpers.
 *
 * Access tokens are short-lived bearer credentials. Refresh tokens are long
 * lived, carry a random `jti`, and are persisted (hashed) so that logout and
 * reuse detection are possible — a bare stateless JWT cannot be revoked.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const ApiError = require('../core/ApiError');
const { TOKEN_TYPES } = require('../core/constants');

/** Random URL-safe token, returned raw (send to user) plus its SHA-256 digest (store). */
function generateOpaqueToken(bytes = 32) {
  const raw = crypto.randomBytes(bytes).toString('hex');
  return { raw, hash: hashToken(raw) };
}

/** One-way digest used for at-rest token storage. */
function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function signAccessToken(payload) {
  return jwt.sign({ ...payload, type: TOKEN_TYPES.ACCESS }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

/**
 * @param {object} payload
 * @param {string} payload.sub User id.
 * @param {string} [jti] Session identifier; generated when omitted.
 */
function signRefreshToken(payload, jti = crypto.randomUUID()) {
  const token = jwt.sign({ ...payload, type: TOKEN_TYPES.REFRESH }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    jwtid: jti,
  });
  return { token, jti };
}

/**
 * Verify a JWT and assert its declared type.
 * @param {string} token
 * @param {'access'|'refresh'} type
 * @throws {ApiError} 401 when the token is missing, expired, or of the wrong type.
 */
function verifyToken(token, type = TOKEN_TYPES.ACCESS) {
  const secret = type === TOKEN_TYPES.REFRESH ? env.JWT_REFRESH_SECRET : env.JWT_ACCESS_SECRET;
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    if (decoded.type !== type) {
      throw ApiError.unauthorized('Invalid token type', { code: 'TOKEN_TYPE_MISMATCH' });
    }
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token has expired', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid or malformed token', { code: 'TOKEN_INVALID' });
  }
}

/** Extract a bearer token from the Authorization header or the refresh cookie. */
function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

/** Convert a duration such as "15m" / "30d" into milliseconds. */
function durationToMs(duration) {
  const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/i.exec(String(duration).trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return value * (factors[unit] ?? 1);
}

/** Human-readable activation code, e.g. `A7K2-9QX4`. Ambiguous glyphs excluded. */
function generateActivationCode(length = env.ACTIVATION_CODE_LENGTH) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }
  // Group in blocks of four for legibility when read aloud or copied by hand.
  return code.match(/.{1,4}/g).join('-');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  extractBearerToken,
  generateOpaqueToken,
  hashToken,
  durationToMs,
  generateActivationCode,
};
