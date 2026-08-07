'use strict';

const { Router } = require('express');

const controller = require('./activationCode.controller');
const schemas = require('./activationCode.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate, instructorOnly } = require('../../middlewares/auth.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Activation Codes
 *   description: >
 *     Single-use student registration codes. Most are issued deliberately by an
 *     instructor via `POST /activation-codes`, but `activationCode` is optional at
 *     `POST /auth/register` — when a student registers without one, the server
 *     generates and immediately consumes a code of its own so the registration
 *     still appears here for audit purposes. Auto-generated entries are
 *     distinguishable by `issuedBy: null` and a note marking them system-generated.
 */

/**
 * @swagger
 * /activation-codes/verify/{code}:
 *   get:
 *     summary: Check whether an activation code is redeemable
 *     description: >
 *       Public endpoint so a registration form can validate a code before the
 *       user fills in the rest of the form. Does not consume the code and
 *       returns only non-sensitive fields.
 *     tags: [Activation Codes]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *         example: "A7K2-9QX4-M3"
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Activation code is valid"
 *               data:
 *                 code: "A7K2-9QX4-M3"
 *                 valid: true
 *                 status: "unused"
 *                 expiresAt: "2026-08-14T00:00:00.000Z"
 *                 collection: { id: "665f...", name: "Physics – Grade 11", subject: "Physics" }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/verify/:code', authLimiter, validate(schemas.verify), controller.verify);

// Everything below is instructor-only administration.
router.use(authenticate, instructorOnly);

/**
 * @swagger
 * /activation-codes:
 *   post:
 *     summary: Generate one or more activation codes
 *     description: >
 *       Codes expire after `expiresInDays` (default from `ACTIVATION_CODE_EXPIRES_IN_DAYS`)
 *       and can be consumed exactly once. Binding a code to a collection
 *       auto-enrols the student on registration; binding it to an email restricts
 *       who may redeem it and sends the code by mail.
 *     tags: [Activation Codes]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity: { type: integer, minimum: 1, maximum: 100, default: 1 }
 *               expiresInDays: { type: integer, minimum: 1, maximum: 365, example: 14 }
 *               collectionId: { type: string, description: Collection to auto-enrol into }
 *               intendedEmail: { type: string, format: email, description: Restricts redemption to this address }
 *               intendedName: { type: string }
 *               educationLevel: { $ref: '#/components/schemas/EducationLevel' }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Codes generated }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: List activation codes
 *     description: >
 *       Includes both instructor-issued codes and codes auto-generated when a
 *       student registered without one — the latter have `issuedBy: null` and
 *       are already `used` by the time they appear here.
 *     tags: [Activation Codes]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [unused, used, revoked] }
 *       - in: query
 *         name: collectionId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of activation codes
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Activation codes retrieved successfully"
 *               data:
 *                 - id: "665f1c2e9b1e8a0012ab3501"
 *                   code: "A7K2-9QX4-M3"
 *                   status: "unused"
 *                   issuedBy: { id: "665f...", fullName: "Head Instructor", email: "instructor@edu-system.local" }
 *                   expiresAt: "2026-08-18T00:00:00.000Z"
 *                 - id: "665f1c2e9b1e8a0012ab3502"
 *                   code: "QK9F-2LMX-7T"
 *                   status: "used"
 *                   issuedBy: null
 *                   usedBy: { id: "665f...", fullName: "Yara Hassan", email: "yara@example.com" }
 *                   notes: "Auto-generated — student registered without an activation code"
 *               meta:
 *                 pagination: { total: 2, count: 2, page: 1, limit: 20, totalPages: 1, hasPreviousPage: false, hasNextPage: false }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router
  .route('/')
  .post(validate(schemas.issue), controller.issue)
  .get(validate(schemas.list), controller.list);

/**
 * @swagger
 * /activation-codes/statistics:
 *   get:
 *     summary: Counts of unused, used, revoked and expired codes
 *     tags: [Activation Codes]
 *     responses:
 *       200:
 *         description: Statistics returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: { unused: 12, used: 45, revoked: 2, expired: 3 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/statistics', controller.statistics);

/**
 * @swagger
 * /activation-codes/{id}:
 *   get:
 *     summary: Get a single activation code
 *     tags: [Activation Codes]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Code returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Soft-delete an activation code
 *     tags: [Activation Codes]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Code deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .delete(validate({ params: schemas.idParams }), controller.remove);

/**
 * @swagger
 * /activation-codes/{id}/revoke:
 *   patch:
 *     summary: Revoke an unused activation code
 *     description: A code that has already been redeemed cannot be revoked.
 *     tags: [Activation Codes]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Code revoked }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/revoke', validate({ params: schemas.idParams }), controller.revoke);

/**
 * @swagger
 * /activation-codes/{id}/extend:
 *   patch:
 *     summary: Extend the expiry of an unused activation code
 *     tags: [Activation Codes]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [days]
 *             properties:
 *               days: { type: integer, minimum: 1, maximum: 365, example: 7 }
 *     responses:
 *       200: { description: Expiry extended }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch('/:id/extend', validate(schemas.extend), controller.extend);

module.exports = router;
