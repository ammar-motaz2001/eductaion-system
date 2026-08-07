'use strict';

const { Router } = require('express');

const controller = require('./attendance.controller');
const schemas = require('./attendance.validation');
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
 *   name: Attendance
 *   description: >
 *     Attendance submission and review. Students submit (status `pending`), the
 *     instructor confirms `present` or marks `absent`. Attendance percentage,
 *     total present and total absent are recalculated automatically, and a
 *     warning notification is generated when a student's percentage falls below
 *     the configured threshold (default 50%).
 */

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /attendance/submit:
 *   post:
 *     summary: Submit your own attendance for a class day (students)
 *     description: >
 *       Creates a record with status `pending` for instructor review. Only one
 *       record may exist per student, per collection, per day. Defaults to today
 *       when `date` is omitted.
 *     tags: [Attendance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collectionId]
 *             properties:
 *               collectionId: { type: string }
 *               date: { type: string, format: date, example: "2026-07-31" }
 *               notes: { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: Attendance submitted; awaiting review }
 *       400: { description: Not enrolled in this collection }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Attendance for this day already exists }
 */
router.post('/submit', studentOnly, validate(schemas.submit), controller.submit);

/**
 * @swagger
 * /attendance/me:
 *   get:
 *     summary: List your own attendance records (students)
 *     tags: [Attendance]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, present, absent] }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/me', studentOnly, validate(schemas.list), controller.listMine);

/**
 * @swagger
 * /attendance/summary:
 *   get:
 *     summary: Attendance summary with warning flag
 *     description: >
 *       Percentage is `present ÷ (present + absent)`; pending records are excluded
 *       because they have not been adjudicated. Instructors may pass `?student=`;
 *       students always receive their own figures.
 *     tags: [Attendance]
 *     parameters:
 *       - in: query
 *         name: student
 *         schema: { type: string }
 *         description: Instructor-only; ignored for students
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Summary returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 totalPresent: 18
 *                 totalAbsent: 6
 *                 totalPending: 1
 *                 totalSessions: 24
 *                 attendancePercentage: 75
 *                 threshold: 50
 *                 hasWarning: false
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/summary', validate(schemas.summary), controller.summary);

router.use(instructorOnly);

/**
 * @swagger
 * /attendance:
 *   post:
 *     summary: Record a final attendance status for one student
 *     description: >
 *       Idempotent upsert on (student, collection, day). Recalculates the
 *       student's cached statistics and evaluates the low-attendance rule.
 *     tags: [Attendance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [student, collectionId, status]
 *             properties:
 *               student: { type: string }
 *               collectionId: { type: string }
 *               date: { type: string, format: date }
 *               status: { type: string, enum: [present, absent] }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Attendance recorded }
 *       400: { description: Student is not enrolled in this collection }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *
 *   get:
 *     summary: List attendance records
 *     tags: [Attendance]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - in: query
 *         name: student
 *         schema: { type: string }
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, present, absent] }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Matches the whole day; range operators such as `date[gte]` are also supported
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 */
router
  .route('/')
  .post(validate(schemas.record), controller.record)
  .get(validate(schemas.list), controller.list);

/**
 * @swagger
 * /attendance/bulk:
 *   post:
 *     summary: Record attendance for a whole class in one call
 *     description: >
 *       Partial success: students not enrolled in the collection are reported
 *       under `skipped`. Statistics are recomputed once per affected student.
 *     tags: [Attendance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collectionId, records]
 *             properties:
 *               collectionId: { type: string }
 *               date: { type: string, format: date }
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [student, status]
 *                   properties:
 *                     student: { type: string }
 *                     status: { type: string, enum: [present, absent] }
 *                     notes: { type: string }
 *           example:
 *             collectionId: "665f...c1"
 *             date: "2026-07-31"
 *             records:
 *               - { student: "665f...a1", status: "present" }
 *               - { student: "665f...a2", status: "absent", notes: "Called in sick" }
 *     responses:
 *       201: { description: Bulk attendance recorded }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/bulk', validate(schemas.recordBulk), controller.recordBulk);

/**
 * @swagger
 * /attendance/pending:
 *   get:
 *     summary: List submissions awaiting review
 *     tags: [Attendance]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/pending', validate(schemas.list), controller.listPending);

/**
 * @swagger
 * /attendance/today:
 *   get:
 *     summary: Today's attendance totals across all collections
 *     tags: [Attendance]
 *     responses:
 *       200:
 *         description: Summary returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: { pending: 3, present: 42, absent: 5, total: 50, attendancePercentage: 89.36 }
 */
router.get('/today', controller.todaySummary);

/**
 * @swagger
 * /attendance/collection/{collectionId}:
 *   get:
 *     summary: Attendance for one collection on one day
 *     tags: [Attendance]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Defaults to today
 *     responses:
 *       200: { description: Day sheet returned }
 */
router.get('/collection/:collectionId', validate(schemas.collectionDay), controller.collectionDay);

/**
 * @swagger
 * /attendance/recalculate:
 *   post:
 *     summary: Recompute cached attendance statistics for every student
 *     description: Maintenance endpoint — use after a data import or manual database edit.
 *     tags: [Attendance]
 *     responses:
 *       200: { description: Statistics recalculated }
 */
router.post('/recalculate', controller.recalculate);

/**
 * @swagger
 * /attendance/{id}/review:
 *   patch:
 *     summary: Confirm or reject a pending submission
 *     description: Only records still in `pending` state can be reviewed.
 *     tags: [Attendance]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [present, absent] }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Attendance reviewed }
 *       409: { description: Record has already been reviewed }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/review', validate(schemas.review), controller.review);

/**
 * @swagger
 * /attendance/{id}:
 *   get:
 *     summary: Get one attendance record
 *     tags: [Attendance]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Record returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Amend an attendance record
 *     tags: [Attendance]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [pending, present, absent] }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Record updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete an attendance record
 *     description: Statistics are recalculated for the affected student.
 *     tags: [Attendance]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Record deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(validate(schemas.update), controller.update)
  .delete(validate({ params: schemas.idParams }), controller.remove);

module.exports = router;
