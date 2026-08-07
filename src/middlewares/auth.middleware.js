'use strict';

const ApiError = require('../core/ApiError');
const asyncHandler = require('../core/asyncHandler');
const { ROLES, STUDENT_STATUS, TOKEN_TYPES } = require('../core/constants');
const { verifyToken, extractBearerToken } = require('../utils/token.util');
const User = require('../modules/users/user.model');

/**
 * Authenticate the bearer token and attach the caller to `req.user`.
 *
 * Beyond signature verification this re-checks the *current* account state on
 * every request, so a deleted, locked, or password-rotated account loses access
 * immediately rather than when its access token happens to expire.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authorization header with a bearer token is required');
  }

  const decoded = verifyToken(token, TOKEN_TYPES.ACCESS);

  const user = await User.findOne({ _id: decoded.sub, deletedAt: null }).select(
    '+passwordChangedAt'
  );

  if (!user) throw ApiError.unauthorized('The account for this token no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  if (user.passwordChangedAfter(decoded.iat)) {
    throw ApiError.unauthorized('Password was changed recently — please sign in again', {
      code: 'PASSWORD_CHANGED',
    });
  }

  req.user = user;
  req.token = { raw: token, payload: decoded };
  return next();
});

/**
 * Populate `req.user` when a valid token is present, but never reject.
 * Useful for endpoints whose response is richer for signed-in callers.
 */
const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    const decoded = verifyToken(token, TOKEN_TYPES.ACCESS);
    const user = await User.findOne({ _id: decoded.sub, deletedAt: null, isActive: true });
    if (user && !user.passwordChangedAfter(decoded.iat)) {
      req.user = user;
      req.token = { raw: token, payload: decoded };
    }
  } catch {
    // Ignored by design — the route is reachable anonymously.
  }
  return next();
});

/**
 * Restrict a route to one or more roles.
 * @param {...string} allowedRoles
 */
function authorize(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This action requires one of the following roles: ${roles.join(', ')}`, {
          code: 'INSUFFICIENT_ROLE',
        })
      );
    }
    return next();
  };
}

/** Shorthand for instructor-only (administrative) routes. */
const instructorOnly = authorize(ROLES.INSTRUCTOR);

/** Shorthand for student-only routes (self-service actions). */
const studentOnly = authorize(ROLES.STUDENT);

/**
 * Require an approved student account.
 *
 * Pending students can authenticate — so they can see their own status and
 * change their password — but must not reach course content.
 */
function requireActiveStudent(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== ROLES.STUDENT) return next();
  if (req.user.status !== STUDENT_STATUS.ACTIVE) {
    return next(
      ApiError.forbidden('Your account is pending instructor approval', {
        code: 'ACCOUNT_PENDING_APPROVAL',
      })
    );
  }
  return next();
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  instructorOnly,
  studentOnly,
  requireActiveStudent,
};
