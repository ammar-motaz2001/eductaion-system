'use strict';

const env = require('../../config/env');
const logger = require('../../config/logger');
const ApiError = require('../../core/ApiError');
const {
  ROLES,
  STUDENT_STATUS,
  TOKEN_TYPES,
  ACTIVATION_CODE_STATUS,
} = require('../../core/constants');
const {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
  generateOpaqueToken,
  durationToMs,
} = require('../../utils/token.util');
const { addMinutes } = require('../../utils/date.util');
const mailService = require('../../services/mail.service');

const userRepository = require('../users/user.repository');
const studentRepository = require('../students/student.repository');
const activationCodeRepository = require('../activation-codes/activationCode.repository');
const collectionStudentRepository = require('../collection-students/collectionStudent.repository');
const collectionRepository = require('../collections/collection.repository');
const notificationService = require('../notifications/notification.service');

/**
 * Authentication, registration and credential lifecycle.
 *
 * Refresh tokens are rotated on every use and persisted as digests, which gives
 * three properties a bare JWT pair cannot: logout actually revokes, a stolen
 * token stops working once the legitimate client refreshes, and a password
 * change invalidates every outstanding session.
 */
class AuthService {
  constructor({
    users = userRepository,
    students = studentRepository,
    activationCodes = activationCodeRepository,
    enrolments = collectionStudentRepository,
    collections = collectionRepository,
    notifications = notificationService,
    mailer = mailService,
  } = {}) {
    this.users = users;
    this.students = students;
    this.activationCodes = activationCodes;
    this.enrolments = enrolments;
    this.collections = collections;
    this.notifications = notifications;
    this.mailer = mailer;
  }

  /** Shape a user document for API responses. */
  static toPublicUser(user) {
    const source = typeof user.toJSON === 'function' ? user.toJSON() : user;
    return {
      id: String(source.id || source._id),
      fullName: source.fullName,
      email: source.email,
      phone: source.phone ?? null,
      role: source.role,
      status: source.status,
      profileImage: source.profileImage ?? null,
      isActive: source.isActive,
      lastLoginAt: source.lastLoginAt ?? null,
      createdAt: source.createdAt,
    };
  }

  /**
   * Mint an access/refresh pair and persist the refresh session.
   * @param {object} user Mongoose user document.
   * @param {{userAgent?: string, ipAddress?: string}} [context]
   */
  async #issueTokens(user, context = {}) {
    const payload = { sub: String(user._id), role: user.role, status: user.status };
    const accessToken = signAccessToken(payload);
    const { token: refreshToken, jti } = signRefreshToken(payload);

    await this.users.addRefreshSession(user._id, {
      jti,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN)),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: Math.floor(durationToMs(env.JWT_ACCESS_EXPIRES_IN) / 1000),
    };
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Validate and atomically claim an instructor-issued code.
   * Existence/status/expiry are checked before claiming so the caller gets a
   * precise reason rather than a generic "unavailable".
   */
  async #claimProvidedCode(rawCode, email) {
    const codeRecord = await this.activationCodes.findByCode(rawCode);
    if (!codeRecord) throw ApiError.badRequest('Activation code is not recognised');
    if (codeRecord.status === ACTIVATION_CODE_STATUS.USED) {
      throw ApiError.conflict('This activation code has already been used');
    }
    if (codeRecord.status === ACTIVATION_CODE_STATUS.REVOKED) {
      throw ApiError.badRequest('This activation code has been revoked');
    }
    if (new Date(codeRecord.expiresAt).getTime() <= Date.now()) {
      throw ApiError.badRequest('This activation code has expired');
    }
    if (codeRecord.intendedEmail && codeRecord.intendedEmail !== email.toLowerCase()) {
      throw ApiError.forbidden('This activation code was issued for a different email address');
    }

    const claimed = await this.activationCodes.claim(rawCode, null);
    if (!claimed) throw ApiError.conflict('This activation code is no longer available');
    return claimed;
  }

  /**
   * Generate and immediately consume a fresh code for a code-less registration.
   *
   * A code is still created — with `issuedBy: null` and a note marking it
   * system-generated — purely so the registration leaves the same auditable
   * trail as an instructor-issued one, visible via `GET /activation-codes`.
   * It carries no collection/email binding since nothing pre-configured it.
   */
  async #generateAutoActivationCode() {
    let code;
    try {
      code = await this.activationCodes.allocateUniqueCode();
    } catch {
      throw ApiError.internal('Could not allocate an activation code — please retry');
    }

    return this.activationCodes.create({
      code,
      status: ACTIVATION_CODE_STATUS.USED,
      issuedBy: null,
      expiresAt: new Date(),
      usedAt: new Date(),
      notes: 'Auto-generated — student registered without an activation code',
    });
  }

  /**
   * Register a student.
   *
   * `payload.activationCode` is optional. When supplied, it must be a valid,
   * unused, unexpired instructor-issued code — redeeming it inherits any
   * education level / collection it was bound to and auto-enrols the student.
   * When omitted, a fresh code is generated and consumed automatically so the
   * registration still shows up in the instructor's activation-codes list.
   *
   * The account is created with `pending` status and only becomes usable once
   * an instructor approves it. Whichever code path is taken, its record is
   * rolled back if account creation fails afterwards, so a failed attempt
   * never leaves a redeemable code burned or an orphaned audit entry.
   *
   * No tokens are issued here — the account cannot sign in until approved — so
   * unlike login this flow records no session context.
   *
   * @param {object} payload
   */
  async registerStudent(payload) {
    const { activationCode, email, password, fullName, ...profile } = payload;

    const existing = await this.users.findByEmail(email, { includeDeleted: true });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const codeRecord = activationCode
      ? await this.#claimProvidedCode(activationCode, email)
      : await this.#generateAutoActivationCode();

    let createdUser = null;
    try {
      // `create` via the model so the password-hashing hook runs.
      createdUser = await this.users.model.create({
        fullName,
        email,
        password,
        phone: profile.phone,
        role: ROLES.STUDENT,
        status: STUDENT_STATUS.PENDING,
      });

      const student = await this.students.create({
        user: createdUser._id,
        fullName,
        email: String(email).toLowerCase(),
        age: profile.age,
        phone: profile.phone,
        parentPhone: profile.parentPhone,
        educationLevel: profile.educationLevel || codeRecord.educationLevel,
        school: profile.school,
        address: profile.address,
        status: STUDENT_STATUS.PENDING,
        activationCode: codeRecord._id,
        collections: codeRecord.collectionId ? [codeRecord.collectionId] : [],
      });

      await this.activationCodes.updateById(codeRecord._id, {
        $set: { usedBy: createdUser._id },
      });

      // Pre-bound collection: enrol immediately so the roster is correct on approval.
      if (codeRecord.collectionId) {
        await this.enrolments.create({
          collectionId: codeRecord.collectionId,
          student: student._id,
          studentName: student.fullName,
          addedBy: codeRecord.issuedBy,
        });
        await this.collections.adjustStudentsCount(codeRecord.collectionId, 1);
      }

      await this.notifications.pendingStudentApproval({ student });

      return {
        user: AuthService.toPublicUser(createdUser),
        student: { id: String(student._id), status: student.status },
        message:
          'Registration successful. Your account is pending instructor approval and cannot sign in yet.',
      };
    } catch (error) {
      // Compensating actions — no transaction is available on standalone MongoDB.
      if (activationCode) {
        await this.activationCodes.release(codeRecord._id).catch(() => {});
      } else {
        // Auto-generated codes are one-off audit records, not meant to be reused.
        await this.activationCodes.hardDeleteById(codeRecord._id).catch(() => {});
      }
      if (createdUser) {
        await this.users.hardDeleteById(createdUser._id).catch(() => {});
      }
      throw error;
    }
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  /**
   * Exchange credentials for a token pair.
   *
   * A pending student is allowed to authenticate — they need to see their own
   * status — but `requireActiveStudent` blocks them from course content.
   */
  async login({ email, password }, context = {}) {
    const user = await this.users.findByEmailWithPassword(email);

    // Same message for unknown email and wrong password: no account enumeration.
    const genericFailure = ApiError.unauthorized('Invalid email or password');
    if (!user) throw genericFailure;

    const matches = await user.comparePassword(password);
    if (!matches) throw genericFailure;

    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

    const tokens = await this.#issueTokens(user, context);
    await this.users.updateById(user._id, { $set: { lastLoginAt: new Date() } });

    const result = {
      user: AuthService.toPublicUser(user),
      tokens,
    };

    if (user.role === ROLES.STUDENT) {
      const student = await this.students.findByUserId(user._id, {
        select: '_id status educationLevel collections attendancePercentage paymentStatus',
      });
      result.student = student || null;
      if (user.status === STUDENT_STATUS.PENDING) {
        result.notice =
          'Your account is pending instructor approval; access is limited until approved.';
      }
    }

    return result;
  }

  /**
   * Rotate a refresh token.
   *
   * The presented token must match a stored session. On success the old session
   * is destroyed and a new one issued; if a token is presented that verifies but
   * has no stored session it is treated as replay and *all* sessions are revoked.
   */
  async refresh({ refreshToken }, context = {}) {
    const decoded = verifyToken(refreshToken, TOKEN_TYPES.REFRESH);

    const user = await this.users.findDocumentById(decoded.sub, '+refreshSessions');
    if (!user) throw ApiError.unauthorized('Session no longer valid');
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

    const presentedHash = hashToken(refreshToken);
    const session = (user.refreshSessions || []).find(
      (candidate) => candidate.jti === decoded.jti && candidate.tokenHash === presentedHash
    );

    if (!session) {
      // Valid signature but unknown session → likely a replayed/stolen token.
      logger.warn('Refresh token reuse detected — revoking all sessions', {
        userId: String(user._id),
      });
      await this.users.clearRefreshSessions(user._id);
      throw ApiError.unauthorized('Refresh token is no longer valid. Please sign in again.', {
        code: 'REFRESH_TOKEN_REUSED',
      });
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.users.removeRefreshSession(user._id, session.jti);
      throw ApiError.unauthorized('Session has expired. Please sign in again.');
    }

    await this.users.removeRefreshSession(user._id, session.jti); // rotation
    const tokens = await this.#issueTokens(user, context);
    return { tokens, user: AuthService.toPublicUser(user) };
  }

  /**
   * Revoke the presented session, or every session when `allDevices` is set.
   * Logout is idempotent: an already-invalid token still returns success.
   */
  async logout(user, { refreshToken, allDevices = false } = {}) {
    if (allDevices) {
      await this.users.clearRefreshSessions(user._id);
      return { revoked: 'all' };
    }

    if (!refreshToken) {
      // No token supplied — nothing server-side to revoke; client drops its copy.
      return { revoked: 'none' };
    }

    try {
      const decoded = verifyToken(refreshToken, TOKEN_TYPES.REFRESH);
      await this.users.removeRefreshSession(user._id, decoded.jti);
      return { revoked: 'current' };
    } catch {
      return { revoked: 'none' };
    }
  }

  /** Active sessions for the caller, with secrets stripped. */
  async listSessions(userId) {
    const sessions = await this.users.getRefreshSessions(userId);
    return sessions
      .filter((session) => session.expiresAt.getTime() > Date.now())
      .map((session) => ({
        id: session.jti,
        userAgent: session.userAgent || null,
        ipAddress: session.ipAddress || null,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      }));
  }

  // ── Credentials ───────────────────────────────────────────────────────────

  /**
   * Change the caller's password.
   * Every session is revoked so other devices must re-authenticate.
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await this.users.findDocumentById(userId, '+password');
    if (!user) throw ApiError.notFound('Account not found');

    const matches = await user.comparePassword(currentPassword);
    if (!matches) throw ApiError.badRequest('Current password is incorrect');

    if (await user.comparePassword(newPassword)) {
      throw ApiError.badRequest('New password must differ from the current password');
    }

    user.password = newPassword; // hashed by the pre-save hook
    await user.save();
    await this.users.clearRefreshSessions(user._id);

    return {
      message: 'Password changed successfully. Please sign in again on your other devices.',
    };
  }

  /**
   * Begin password recovery.
   *
   * Always reports success so the endpoint cannot be used to discover which
   * email addresses hold accounts.
   */
  async forgotPassword({ email }) {
    const genericResponse = {
      message: 'If an account exists for this email, a reset link has been sent.',
    };

    // A hydrated document is required so the pre-save hook and validators run.
    const user = await this.users.findByEmailWithPassword(email);
    if (!user || !user.isActive) return genericResponse;

    const { raw, hash } = generateOpaqueToken();
    user.passwordResetTokenHash = hash;
    user.passwordResetExpiresAt = addMinutes(new Date(), env.RESET_TOKEN_EXPIRES_IN_MINUTES);
    await user.save({ validateBeforeSave: false });

    await this.mailer.sendPasswordReset({ to: user.email, name: user.fullName, token: raw });

    // In development the token is returned so the flow is testable without SMTP.
    return env.isProduction ? genericResponse : { ...genericResponse, resetToken: raw };
  }

  /** Complete password recovery using the emailed token. */
  async resetPassword({ token, newPassword }) {
    const user = await this.users.findByResetTokenHash(hashToken(token));
    if (!user) throw ApiError.badRequest('Reset token is invalid or has expired');

    user.password = newPassword;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();
    await this.users.clearRefreshSessions(user._id);

    return { message: 'Password has been reset. You can now sign in with your new password.' };
  }

  /** The caller's own profile, with the student record attached when relevant. */
  async me(user) {
    const result = { user: AuthService.toPublicUser(user) };
    if (user.role === ROLES.STUDENT) {
      result.student = await this.students.findByUserId(user._id, {
        populate: { path: 'collections', select: 'name subject educationLevel' },
      });
    }
    return result;
  }
}

module.exports = new AuthService();
module.exports.AuthService = AuthService;
