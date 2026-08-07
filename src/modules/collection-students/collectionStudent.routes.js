'use strict';

const { Router } = require('express');

const controller = require('./collectionStudent.controller');
const schemas = require('./collectionStudent.validation');
const validate = require('../../middlewares/validate.middleware');
const { instructorOnly } = require('../../middlewares/auth.middleware');

// `mergeParams` exposes `:collectionId` from the parent collection router.
const router = Router({ mergeParams: true });

/**
 * @swagger
 * tags:
 *   name: Collection Students
 *   description: Enrolment of students into teaching groups
 */

/**
 * @swagger
 * /collections/{collectionId}/students:
 *   post:
 *     summary: Enrol one or many students into a collection
 *     description: >
 *       Provide either `student` for a single enrolment or `students` for a batch.
 *       Batch mode is partial-success: each student is reported under `enrolled`
 *       or `skipped` with a reason. Only approved (active) students may be
 *       enrolled, and capacity is enforced when set.
 *     tags: [Collection Students]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               student: { type: string, description: Single student id }
 *               students:
 *                 type: array
 *                 items: { type: string }
 *                 description: Batch of student ids
 *               notes: { type: string, maxLength: 500 }
 *           examples:
 *             single:
 *               summary: Enrol one student
 *               value: { student: "665f1c2e9b1e8a0012ab34ce" }
 *             batch:
 *               summary: Enrol several students
 *               value: { students: ["665f...a1", "665f...a2"] }
 *     responses:
 *       201:
 *         description: Enrolment result
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "2 student(s) enrolled, 1 skipped"
 *               data:
 *                 enrolled: [{ student: "665f...a1", enrolmentId: "665f...b1" }]
 *                 skipped: [{ student: "665f...a3", reason: "This student is already enrolled in this collection" }]
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *
 *   get:
 *     summary: List and search the students in a collection
 *     description: >
 *       Returns full student profiles (attendance and payment status included).
 *       Instructors see any collection; students only collections they belong to.
 *       Use `?search=` to search inside the collection by name, email, phone or school.
 *     tags: [Collection Students]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: paymentStatus
 *         schema: { type: string, enum: [pending, paid, late] }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/')
  .post(instructorOnly, validate(schemas.addStudent), controller.addStudent)
  .get(validate(schemas.listStudents), controller.listStudents);

/**
 * @swagger
 * /collections/{collectionId}/students/enrolments:
 *   get:
 *     summary: List raw enrolment records with join metadata
 *     description: Returns the join rows themselves (enrolled date, who added them, active flag).
 *     tags: [Collection Students]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/enrolments',
  instructorOnly,
  validate({ params: schemas.collectionParams }),
  controller.listEnrolments
);

/**
 * @swagger
 * /collections/{collectionId}/students/{studentId}:
 *   delete:
 *     summary: Remove a student from a collection
 *     description: >
 *       Unenrols the student. Attendance, grades and payments already recorded
 *       for this collection are preserved.
 *     tags: [Collection Students]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/StudentIdParam'
 *     responses:
 *       200: { description: Student removed }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/:studentId',
  instructorOnly,
  validate(schemas.removeStudent),
  controller.removeStudent
);

/**
 * @swagger
 * /collections/{collectionId}/students/{studentId}/status:
 *   patch:
 *     summary: Suspend or reactivate an enrolment
 *     tags: [Collection Students]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/StudentIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Enrolment status updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  '/:studentId/status',
  instructorOnly,
  validate(schemas.setActive),
  controller.setActive
);

module.exports = router;
