'use strict';

const { Router } = require('express');

const controller = require('./payment.controller');
const schemas = require('./payment.validation');
const validate = require('../../middlewares/validate.middleware');
const {
  authenticate,
  instructorOnly,
  studentOnly,
  requireActiveStudent,
} = require('../../middlewares/auth.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: >
 *     Student payments. Status is derived, not trusted: an unpaid item whose due
 *     date has passed is swept to `late` on every read, and settling a payment
 *     writes a matching entry into the revenue ledger.
 */

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /payments/me:
 *   get:
 *     summary: List your own payments (students)
 *     tags: [Payments]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, paid, late] }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/me', studentOnly, validate(schemas.list), controller.listMine);

/**
 * @swagger
 * /payments/student/{studentId}:
 *   get:
 *     summary: List a student's payment history
 *     description: Instructors may read any student; students only their own record.
 *     tags: [Payments]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, paid, late] }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/student/:studentId', validate(schemas.listForStudent), controller.listForStudent);

router.use(instructorOnly);

/**
 * @swagger
 * /payments:
 *   post:
 *     summary: Record a payment obligation
 *     description: >
 *       `amount` defaults to the collection's monthly subscription price. The
 *       initial status is derived from the due date unless the payment is created
 *       already settled, in which case a revenue entry is written too.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [student, collectionId, dueDate]
 *             properties:
 *               student: { type: string }
 *               collectionId: { type: string }
 *               amount: { type: number, example: 500 }
 *               currency: { type: string, example: "EGP" }
 *               dueDate: { type: string, format: date-time }
 *               paidDate: { type: string, format: date-time }
 *               status: { type: string, enum: [pending, paid, late] }
 *               paymentMethod: { $ref: '#/components/schemas/PaymentMethod' }
 *               description: { type: string, example: "August 2026 subscription" }
 *               reference: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Payment recorded }
 *       400: { description: Student is not enrolled in this collection }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 *   get:
 *     summary: List all payments with a status summary
 *     description: The `meta.summary` block reports totals per status plus the outstanding balance.
 *     tags: [Payments]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: student
 *         schema: { type: string }
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, paid, late] }
 *       - in: query
 *         name: dueDate
 *         schema: { type: string }
 *         description: Supports range operators, e.g. `dueDate[lte]=2026-08-31`
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 */
router
  .route('/')
  .post(validate(schemas.record), controller.record)
  .get(validate(schemas.list), controller.list);

/**
 * @swagger
 * /payments/summary:
 *   get:
 *     summary: Payment totals by status
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Summary returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 pending: { count: 12, total: 6000 }
 *                 paid: { count: 48, total: 24000 }
 *                 late: { count: 5, total: 2500 }
 *                 outstanding: 8500
 *                 totalBilled: 32500
 */
router.get('/summary', controller.summary);

/**
 * @swagger
 * /payments/methods:
 *   get:
 *     summary: List the supported payment methods
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Methods returned
 *         content:
 *           application/json:
 *             example: { success: true, data: ["cash", "bank-transfer", "card", "wallet", "other"] }
 */
router.get('/methods', controller.paymentMethods);

/**
 * @swagger
 * /payments/generate-invoices:
 *   post:
 *     summary: Generate monthly subscription invoices for a collection
 *     description: >
 *       Creates one payment per enrolled student. Students who already have an
 *       invoice with the same description are reported under `skipped`, so the
 *       endpoint is safe to call twice.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collectionId, dueDate]
 *             properties:
 *               collectionId: { type: string }
 *               dueDate: { type: string, format: date-time }
 *               amount: { type: number, description: Defaults to the collection's monthly price }
 *               description: { type: string, example: "August 2026 subscription" }
 *     responses:
 *       201: { description: Invoices generated }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/generate-invoices', validate(schemas.generateInvoices), controller.generateInvoices);

/**
 * @swagger
 * /payments/{id}/pay:
 *   patch:
 *     summary: Mark a payment as paid
 *     description: Idempotent, and writes a matching revenue entry the first time.
 *     tags: [Payments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paidDate: { type: string, format: date-time, description: Defaults to now }
 *               paymentMethod: { $ref: '#/components/schemas/PaymentMethod' }
 *               reference: { type: string }
 *     responses:
 *       200: { description: Payment settled }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/pay', validate(schemas.markAsPaid), controller.markAsPaid);

/**
 * @swagger
 * /payments/{id}/late:
 *   patch:
 *     summary: Mark a payment as late
 *     tags: [Payments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string }
 *     responses:
 *       200: { description: Payment marked late }
 *       409: { description: A settled payment cannot be marked late }
 */
router.patch('/:id/late', validate(schemas.markAsLate), controller.markAsLate);

/**
 * @swagger
 * /payments/{id}/reverse:
 *   patch:
 *     summary: Reverse a settled payment
 *     description: Removes the mirrored revenue entry so the financial summary stays correct.
 *     tags: [Payments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Settlement reversed }
 *       409: { description: Only a settled payment can be reversed }
 */
router.patch('/:id/reverse', validate({ params: schemas.idParams }), controller.reverse);

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     summary: Get a payment
 *     tags: [Payments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Payment returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a payment's details
 *     description: >
 *       Status and paid date are managed through the dedicated `/pay`, `/late`
 *       and `/reverse` endpoints so the revenue ledger cannot drift.
 *     tags: [Payments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: number }
 *               currency: { type: string }
 *               dueDate: { type: string, format: date-time }
 *               paymentMethod: { $ref: '#/components/schemas/PaymentMethod' }
 *               description: { type: string }
 *               reference: { type: string }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Payment updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete a payment and any revenue entry it generated
 *     tags: [Payments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Payment deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(validate(schemas.update), controller.update)
  .delete(validate({ params: schemas.idParams }), controller.remove);

module.exports = router;
