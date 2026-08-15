'use strict';

/**
 * SMTP diagnostic.
 *
 * Authenticates against the configured SMTP server and, when given a recipient,
 * sends a test message — so credential problems can be told apart from delivery
 * problems without going through an application flow.
 *
 *   npm run mail:check
 *   npm run mail:check -- you@example.com
 *
 * Exits non-zero on failure, so it doubles as a deployment pre-flight check.
 */

const env = require('../config/env');
const logger = require('../config/logger');
const mailService = require('../services/mail.service');

const recipient = process.argv[2] || null;

async function main() {
  logger.info('SMTP configuration', {
    host: env.SMTP_HOST || '(empty)',
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER || '(none)',
    passwordSet: Boolean(env.SMTP_PASSWORD),
    from: env.MAIL_FROM,
  });

  const connection = await mailService.verifyConnection();
  if (!connection.ok) {
    // A disabled mailer and a rejected login both land here; the reason
    // distinguishes them.
    logger.error(
      env.mailEnabled ? 'SMTP connection failed' : 'The mailer is disabled and sends nothing',
      { reason: connection.reason }
    );
    process.exitCode = 1;
    return;
  }
  logger.info('SMTP connection and credentials accepted');

  if (!recipient) {
    logger.info('Pass an address to send a test message: npm run mail:check -- you@example.com');
    return;
  }

  const result = await mailService.send({
    to: recipient,
    subject: `${env.APP_NAME} — SMTP test`,
    text: 'If you are reading this, outbound email is working.',
  });

  if (!result.delivered) {
    logger.error('Test message was rejected', { reason: result.reason });
    process.exitCode = 1;
    return;
  }
  logger.info(`Test message accepted for delivery to ${recipient}`);
}

main().catch((error) => {
  logger.error('Mail check failed', { error: error.message });
  process.exitCode = 1;
});
