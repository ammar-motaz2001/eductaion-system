'use strict';

const { Router } = require('express');

const controller = require('./collection.controller');
const schemas = require('./collection.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate, instructorOnly } = require('../../middlewares/auth.middleware');
const collectionStudentRoutes = require('../collection-students/collectionStudent.routes');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Collections
 *   description: Teaching groups — subject, level, pricing and weekly schedule
 */

router.use(authenticate);

// Nested resource: /collections/:collectionId/students/...
router.use('/:collectionId/students', collectionStudentRoutes);

/**
 * @swagger
 * /collections:
 *   post:
 *     summary: Create a collection
 *     description: >
 *       The combination of name, subject and education level must be unique.
 *       Schedule slots may not overlap on the same weekday.
 *     tags: [Collections]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, subject, educationLevel]
 *             properties:
 *               name: { type: string, example: "Physics – Grade 11 (Saturday group)" }
 *               subject: { type: string, example: "Physics" }
 *               educationLevel: { $ref: '#/components/schemas/EducationLevel' }
 *               pricePerClass: { type: number, example: 150 }
 *               monthlySubscriptionPrice: { type: number, example: 500 }
 *               capacity: { type: integer, nullable: true, example: 25 }
 *               description: { type: string }
 *               isActive: { type: boolean, default: true }
 *               schedule:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/ScheduleSlot' }
 *           example:
 *             name: "Physics – Grade 11 (Saturday group)"
 *             subject: "Physics"
 *             educationLevel: "secondary-2"
 *             pricePerClass: 150
 *             monthlySubscriptionPrice: 500
 *             capacity: 25
 *             schedule:
 *               - { day: "saturday", startTime: "16:00", endTime: "18:00", room: "A1" }
 *     responses:
 *       201: { description: Collection created }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: List collections
 *     description: >
 *       Instructors see every collection; students see only the collections they
 *       are enrolled in.
 *     tags: [Collections]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: subject
 *         schema: { type: string }
 *       - in: query
 *         name: educationLevel
 *         schema: { $ref: '#/components/schemas/EducationLevel' }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router
  .route('/')
  .post(instructorOnly, validate(schemas.create), controller.create)
  .get(validate(schemas.list), controller.list);

/**
 * @swagger
 * /collections/subjects:
 *   get:
 *     summary: List the distinct subjects currently taught
 *     description: Useful for populating filter dropdowns.
 *     tags: [Collections]
 *     responses:
 *       200:
 *         description: Subjects returned
 *         content:
 *           application/json:
 *             example: { success: true, data: ["Physics", "Mathematics", "Chemistry"] }
 */
router.get('/subjects', controller.subjects);

/**
 * @swagger
 * /collections/{id}:
 *   get:
 *     summary: Get a collection
 *     description: >
 *       Students may only read collections they are enrolled in. The enrolment
 *       counter is verified against the authoritative enrolment records and
 *       self-corrected if it has drifted.
 *     tags: [Collections]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Collection returned }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a collection
 *     tags: [Collections]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               subject: { type: string }
 *               educationLevel: { $ref: '#/components/schemas/EducationLevel' }
 *               pricePerClass: { type: number }
 *               monthlySubscriptionPrice: { type: number }
 *               capacity: { type: integer, nullable: true }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *               schedule:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/ScheduleSlot' }
 *     responses:
 *       200: { description: Collection updated }
 *       400: { description: Capacity below current enrolment, or overlapping schedule }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Soft-delete a collection
 *     description: Detaches every enrolled student; lesson and homework records are retained.
 *     tags: [Collections]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Collection deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(instructorOnly, validate(schemas.update), controller.update)
  .delete(instructorOnly, validate({ params: schemas.idParams }), controller.remove);

/**
 * @swagger
 * /collections/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted collection
 *     tags: [Collections]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Collection restored }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  '/:id/restore',
  instructorOnly,
  validate({ params: schemas.idParams }),
  controller.restore
);

module.exports = router;
