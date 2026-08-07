'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = require('../../core/schemas/file.schema');
const { applyBasePlugins } = require('../../core/plugins');
const { ROLES, STUDENT_STATUS } = require('../../core/constants');
const { hashPassword, comparePassword } = require('../../utils/password.util');

/**
 * Persisted refresh-token session.
 *
 * Only the SHA-256 digest is stored, so a database leak cannot be replayed as a
 * valid session, and logout/revocation become possible for otherwise stateless
 * JWTs.
 */
const refreshSessionSchema = new Schema(
  {
    jti: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, trim: true, maxlength: 300 },
    ipAddress: { type: String, trim: true, maxlength: 64 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Authentication identity. Both instructors and students authenticate through
 * this collection; student *profile* data lives in the `Student` collection,
 * which keeps the auth surface small and the profile freely extensible.
 */
const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      // Uniqueness is declared once below, with a case-insensitive collation.
    },
    phone: { type: String, trim: true, maxlength: 20 },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned unless explicitly requested
      private: true, // stripped by the toJSON plugin as a second line of defence
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      default: ROLES.STUDENT,
      index: true,
    },
    /**
     * Account lifecycle. Instructors are created active; students start
     * `pending` until the instructor approves them.
     */
    status: {
      type: String,
      enum: Object.values(STUDENT_STATUS),
      default: STUDENT_STATUS.PENDING,
      index: true,
    },
    profileImage: { type: fileSchema, default: null },

    /** Set false to lock an account without deleting it. */
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    /** Invalidates access tokens issued before a password change. */
    passwordChangedAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null, select: false, private: true },
    passwordResetExpiresAt: { type: Date, default: null, select: false, private: true },

    refreshSessions: { type: [refreshSessionSchema], default: [], select: false, private: true },
  },
  {
    timestamps: true,
    collation: { locale: 'en', strength: 2 },
  }
);

applyBasePlugins(userSchema);

// Case-insensitive uniqueness on email; supports the login lookup.
userSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ role: 1, status: 1, deletedAt: 1 });
userSchema.index({ fullName: 'text', email: 'text' });

/** Hash the password whenever it is set or changed. */
userSchema.pre('save', async function hashOnSave(next) {
  if (!this.isModified('password')) return next();
  this.password = await hashPassword(this.password);
  if (!this.isNew) this.passwordChangedAt = new Date();
  return next();
});

userSchema.methods.comparePassword = function compare(plain) {
  return comparePassword(plain, this.password);
};

/**
 * True when the password changed after the given JWT was issued, meaning the
 * token must be rejected.
 * @param {number} issuedAtSeconds `iat` claim.
 */
userSchema.methods.passwordChangedAfter = function changedAfter(issuedAtSeconds) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > issuedAtSeconds;
};

userSchema.virtual('isInstructor').get(function isInstructor() {
  return this.role === ROLES.INSTRUCTOR;
});

module.exports = mongoose.model('User', userSchema);
