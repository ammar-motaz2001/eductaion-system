'use strict';

/**
 * SMTP credentials committed to source.
 *
 * These are the fallback values used when no SMTP_* environment variable is set,
 * which lets the deployment send mail without configuring anything in the Vercel
 * dashboard. Real environment variables always win, so setting them later in
 * Vercel overrides this file without a code change.
 *
 * SECURITY: this repository is public. A password here is readable by anyone,
 * and provider-side leak scanners revoke exposed credentials automatically.
 * Prefer Vercel environment variables, or make the repository private, and use a
 * dedicated sending account rather than a personal one.
 *
 * Port and secure must agree: 465 -> secure true, 587 -> secure false.
 */

/** Values still at their shipped defaults — used to keep "not filled in yet"
    reporting as a configuration problem rather than an authentication failure. */
const PLACEHOLDERS = ['your-address@gmail.com', 'your_16_char_app_password'];

const credentials = {
  HOST: 'smtp.gmail.com',
  PORT: 465,
  SECURE: true,
  USER: 'your-address@gmail.com',
  /** Gmail App Password (16 chars, requires 2FA) — not the account password. */
  PASSWORD: 'your_16_char_app_password',
  FROM: 'Education System <your-address@gmail.com>',
};

/** @returns {boolean} true while the file has not been filled in. */
const isPlaceholder = (user, password) =>
  PLACEHOLDERS.includes(user) || PLACEHOLDERS.includes(password);

module.exports = { ...credentials, isPlaceholder };
