'use strict';

const { Router } = require('express');

const controller = require('./auth.controller');
const schemas = require('./auth.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');
const { imageUploader, handleUploadErrors } = require('../../middlewares/upload.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication, registration and credential management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a student
 *     description: >
 *       `activationCode` is optional. If an instructor pre-issued one, supplying it
 *       redeems that code, inherits any education level / collection it was bound
 *       to, and auto-enrols the student. If omitted, the server generates and
 *       immediately consumes a fresh code of its own — `educationLevel` must then
 *       be supplied directly — so the registration still shows up in
 *       `GET /activation-codes` for the instructor (with `issuedBy: null` and a
 *       note marking it system-generated).
 *
 *
 *       Either way, the resulting account is created with `pending` status and
 *       must be approved by an instructor before it gains access.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [fullName, email, password, phone, parentPhone]
 *             properties:
 *               activationCode:
 *                 type: string
 *                 example: "A7K2-9QX4-M3"
 *                 description: Optional — omit to have one generated automatically
 *               fullName: { type: string, example: "minaadel22" }
 *               email: { type: string, format: email, example: "yara@example.com" }
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Minimum 8 characters with upper case, lower case and a digit
 *                 example: "Student@123"
 *               phone: { type: string, example: "+201234567890" }
 *               parentPhone: { type: string, example: "+201234567891" }
 *               age: { type: integer, minimum: 3, maximum: 100, example: 16 }
 *               educationLevel:
 *                 allOf: [{ $ref: '#/components/schemas/EducationLevel' }]
 *                 description: Required unless `activationCode` is supplied and bound to a level
 *               school: { type: string, example: "Cairo Language School" }
 *               address:
 *                 type: string
 *                 description: JSON string matching the Address schema
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional profile photo (JPEG, PNG, WebP, GIF, BMP or SVG, max 5 MB)
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password, phone, parentPhone]
 *             properties:
 *               activationCode:
 *                 type: string
 *                 example: "A7K2-9QX4-M3"
 *                 description: Optional — omit to have one generated automatically
 *               fullName: { type: string, example: "minaadel22" }
 *               email: { type: string, format: email, example: "yara@example.com" }
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Minimum 8 characters with upper case, lower case and a digit
 *                 example: "Student@123"
 *               phone: { type: string, example: "+201234567890" }
 *               parentPhone: { type: string, example: "+201234567891" }
 *               age: { type: integer, minimum: 3, maximum: 100, example: 16 }
 *               educationLevel:
 *                 allOf: [{ $ref: '#/components/schemas/EducationLevel' }]
 *                 description: Required unless `activationCode` is supplied and bound to a level
 *               school: { type: string, example: "Cairo Language School" }
 *               address:
 *                 $ref: '#/components/schemas/Address'
 *           examples:
 *             withoutCode:
 *               summary: No activation code — one is generated automatically
 *               value:
 *                 fullName: "minaadel22"
 *                 email: "yara@example.com"
 *                 password: "Student@123"
 *                 phone: "+201234567890"
 *                 parentPhone: "+201234567891"
 *                 age: 16
 *                 educationLevel: "secondary-2"
 *                 school: "Cairo Language School"
 *             withCode:
 *               summary: Redeeming an instructor-issued code
 *               value:
 *                 activationCode: "A7K2-9QX4-M3"
 *                 fullName: "minaadel22"
 *                 email: "yara@example.com"
 *                 password: "Student@123"
 *                 phone: "+201234567890"
 *                 parentPhone: "+201234567891"
 *     responses:
 *       201:
 *         description: Registration accepted; account awaits approval
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Registration successful. Your account is pending instructor approval and cannot sign in yet."
 *               data:
 *                 user:
 *                   id: "665f1c2e9b1e8a0012ab34cd"
 *                   fullName: "Yara Hassan"
 *                   email: "yara@example.com"
 *                   role: "student"
 *                   status: "pending"
 *                 student: { id: "665f1c2e9b1e8a0012ab34ce", status: "pending" }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/register',
  authLimiter,
  imageUploader.single('image'),
  handleUploadErrors,
  validate(schemas.register),
  controller.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Sign in and receive an access/refresh token pair
 *     description: >
 *       Returns a short-lived access token and a long-lived refresh token.
 *       Students whose account is still `pending` can sign in but receive a
 *       notice and are blocked from course content.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: "instructor@edu-system.local" }
 *               password: { type: string, format: password, example: "Instructor@123" }
 *     responses:
 *       200:
 *         description: Authenticated
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Signed in successfully"
 *               data:
 *                 user: { id: "665f...", fullName: "Head Instructor", role: "instructor", status: "active" }
 *                 tokens:
 *                   accessToken: "eyJhbGciOiJIUzI1NiIs..."
 *                   refreshToken: "eyJhbGciOiJIUzI1NiIs..."
 *                   tokenType: "Bearer"
 *                   expiresIn: 900
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/login', authLimiter, validate(schemas.login), controller.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token
 *     description: >
 *       Exchanges a valid refresh token for a brand-new pair and invalidates the
 *       presented one. Replaying an already-rotated token revokes every session
 *       for that account as a theft countermeasure.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair issued }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post('/refresh', authLimiter, validate(schemas.refresh), controller.refresh);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password-reset token
 *     description: >
 *       Always responds with success regardless of whether the email exists, to
 *       prevent account enumeration. Outside production the reset token is
 *       included in the response so the flow is testable without SMTP.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Reset instructions sent if the account exists }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/forgot-password',
  authLimiter,
  validate(schemas.forgotPassword),
  controller.forgotPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset a password using the emailed token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, format: password, example: "NewPass@123" }
 *     responses:
 *       200: { description: Password reset; all sessions revoked }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post(
  '/reset-password',
  authLimiter,
  validate(schemas.resetPassword),
  controller.resetPassword
);

// ── Authenticated routes ────────────────────────────────────────────────────
router.use(authenticate);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the signed-in user's profile
 *     tags: [Auth]
 *     responses:
 *       200: { description: Profile returned }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', controller.me);

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     summary: List the caller's active refresh sessions
 *     tags: [Auth]
 *     responses:
 *       200: { description: Active sessions returned }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/sessions', controller.listSessions);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke the current session, or every session
 *     tags: [Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string, description: Session to revoke }
 *               allDevices: { type: boolean, default: false, description: Revoke every session }
 *     responses:
 *       200: { description: Signed out }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout', validate(schemas.logout), controller.logout);

/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     summary: Change the caller's password
 *     description: Revokes every refresh session, forcing re-authentication elsewhere.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Password changed }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.patch('/change-password', validate(schemas.changePassword), controller.changePassword);

module.exports = router;
