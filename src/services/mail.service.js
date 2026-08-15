'use strict';

const nodemailer = require('nodemailer');

const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Transactional email.
 *
 * When SMTP is unconfigured the service degrades to logging the message, which
 * keeps flows such as "forgot password" testable in local development without
 * silently pretending mail was delivered.
 */

let transporter = null;

function getTransporter() {
  if (!env.mailEnabled) return null;
  if (transporter) return transporter;

  // A secure/port mismatch produces a hung TLS handshake rather than a clear
  // error, so it is worth naming explicitly before the first send.
  if (env.SMTP_PORT === 465 && !env.SMTP_SECURE) {
    logger.warn('SMTP_PORT 465 requires SMTP_SECURE=true — the handshake will time out');
  }
  if (env.SMTP_PORT === 587 && env.SMTP_SECURE) {
    logger.warn('SMTP_PORT 587 requires SMTP_SECURE=false (STARTTLS is negotiated in-band)');
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // Serverless instances are frozen straight after the response, so a pooled
    // connection is never reusable — and nodemailer's default of waiting
    // indefinitely would let the platform kill the invocation before the catch
    // below ever runs, turning a config error into a silent timeout. These fit
    // inside the 30s maxDuration configured in vercel.json.
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/** Why the mailer is off, phrased for whoever has to fix it. */
function disabledReason() {
  if (!env.SMTP_HOST) return 'SMTP is not configured (SMTP_HOST is empty)';
  return 'SMTP credentials are still the placeholders in src/config/mail.credentials.js';
}

/**
 * Open a connection and authenticate without sending anything.
 * Used by the health check and `npm run mail:check` to separate credential
 * problems from delivery problems.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function verifyConnection() {
  const client = getTransporter();
  if (!client) return { ok: false, reason: disabledReason() };

  try {
    await client.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * @param {{to: string, subject: string, text?: string, html?: string}} message
 * @returns {Promise<{delivered: boolean, reason?: string}>}
 */
async function send({ to, subject, text, html }) {
  const client = getTransporter();

  if (!client) {
    const reason = disabledReason();
    // In production an unconfigured mailer is a deployment fault, not a
    // development convenience — log it loudly enough to surface in Vercel.
    const level = env.isProduction ? 'warn' : 'info';
    logger[level](`[mail:disabled] Email not sent — ${reason}`, { to, subject, text });
    return { delivered: false, reason };
  }

  try {
    await client.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
    logger.info('Email sent', { to, subject });
    return { delivered: true };
  } catch (error) {
    // Mail failures must not fail the request that triggered them.
    logger.error('Email delivery failed', { to, subject, error: error.message });
    return { delivered: false, reason: error.message };
  }
}

/** Password-reset email containing the one-time token link. */
async function sendPasswordReset({ to, name, token }) {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: `${env.APP_NAME} — Password reset request`,
    text: [
      `Hello ${name || ''},`.trim(),
      '',
      'We received a request to reset your password.',
      `Reset link: ${resetUrl}`,
      `Reset token: ${token}`,
      '',
      `This link expires in ${env.RESET_TOKEN_EXPIRES_IN_MINUTES} minutes.`,
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
  });
}

/** Notify a student that their account was approved by the instructor. */
async function sendAccountApproved({ to, name }) {
  return send({
    to,
    subject: `${env.APP_NAME} — Your account is active`,
    text: `Hello ${name || ''},\n\nYour account has been approved and is now active. You can sign in at ${env.CLIENT_URL}.`,
  });
}

/** Deliver a freshly generated activation code to a prospective student. */
async function sendActivationCode({ to, code, expiresAt }) {
  return send({
    to,
    subject: `${env.APP_NAME} — Your activation code`,
    text: [
      'Use the activation code below to complete your registration:',
      '',
      `    ${code}`,
      '',
      `Valid until: ${new Date(expiresAt).toUTCString()}`,
    ].join('\n'),
  });
}

module.exports = {
  send,
  verifyConnection,
  sendPasswordReset,
  sendAccountApproved,
  sendActivationCode,
};
