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

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/**
 * @param {{to: string, subject: string, text?: string, html?: string}} message
 * @returns {Promise<{delivered: boolean}>}
 */
async function send({ to, subject, text, html }) {
  const client = getTransporter();

  if (!client) {
    logger.info('[mail:disabled] Email not sent (SMTP unconfigured)', { to, subject, text });
    return { delivered: false };
  }

  try {
    await client.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
    logger.info('Email sent', { to, subject });
    return { delivered: true };
  } catch (error) {
    // Mail failures must not fail the request that triggered them.
    logger.error('Email delivery failed', { to, subject, error: error.message });
    return { delivered: false };
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

module.exports = { send, sendPasswordReset, sendAccountApproved, sendActivationCode };
