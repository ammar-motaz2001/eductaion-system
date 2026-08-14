'use strict';

/**
 * Environment configuration.
 *
 * All process.env access in the application funnels through this module so that
 * configuration is validated once, at boot, and consumed everywhere as a typed,
 * frozen object. A malformed environment fails fast with a readable report
 * instead of surfacing as an undefined value deep inside a request handler.
 */

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Coerce "true"/"false"/"1"/"0" strings into booleans. */
const booleanish = (defaultValue) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  APP_NAME: z.string().default('Education Management System'),
  CLIENT_URL: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_ISSUER: z.string().default('edu-system'),
  JWT_AUDIENCE: z.string().default('edu-system-clients'),

  RESET_TOKEN_EXPIRES_IN_MINUTES: z.coerce.number().int().positive().default(30),

  ACTIVATION_CODE_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(14),
  ACTIVATION_CODE_LENGTH: z.coerce.number().int().min(6).max(32).default(10),

  ATTENDANCE_WARNING_THRESHOLD: z.coerce.number().min(0).max(100).default(50),

  STORAGE_DRIVER: z.enum(['cloudinary', 'local']).default('local'),
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(100),
  /** Cap for image-only endpoints (profile photos, settings logo). */
  UPLOAD_MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(5),
  LOCAL_UPLOAD_DIR: z.string().default('uploads'),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('edu-system'),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),

  CORS_ORIGINS: z.string().default('*'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanish(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Education System <no-reply@edu-system.local>'),

  SEED_INSTRUCTOR_NAME: z.string().default('Head Instructor'),
  SEED_INSTRUCTOR_EMAIL: z.string().email().default('instructor@edu-system.local'),
  SEED_INSTRUCTOR_PASSWORD: z.string().min(8).default('Instructor@123'),
  SEED_INSTRUCTOR_PHONE: z.string().default('+201000000000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[config] Invalid environment configuration:\n${details}\n`);
  process.exit(1);
}

const raw = parsed.data;

const env = Object.freeze({
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  isVercel: Boolean(process.env.VERCEL),
  localUploadRoot: process.env.VERCEL
    ? path.join('/tmp', raw.LOCAL_UPLOAD_DIR)
    : path.resolve(process.cwd(), raw.LOCAL_UPLOAD_DIR),
  /** Parsed CORS allow-list. `['*']` means "any origin". */
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadMaxFileSizeBytes: raw.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
  /** Cap applied by image-only endpoints (profile photos, settings logo). */
  uploadMaxImageSizeBytes: raw.UPLOAD_MAX_IMAGE_SIZE_MB * 1024 * 1024,
  /* Note: the upload middleware reads the MB values directly so its 413 message
     can name the limit that was actually exceeded. */
  rateLimitWindowMs: raw.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  mailEnabled: Boolean(raw.SMTP_HOST),
  cloudinaryConfigured: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET
  ),
});

module.exports = env;
