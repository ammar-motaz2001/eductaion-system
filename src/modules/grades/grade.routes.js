'use strict';

const { Router } = require('express');

const controller = require('./grade.controller');
const schemas = require('./grade.validation');
const validate = require('../../middlewares/validate.middleware');
const { z, objectId } = require('../../utils/validators');
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
 *   name: Grades
 *   description: >
 *     Exam results. Supported exam types are quiz, assignment, homework, midterm
 *     and final. Averages are score-weighted (total scored ÷ total possible), so
 *     a high-mark exam counts more than a small quiz.
 */

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /grades/me:
 *   get:
 *     summary: List your own grades with a summary (students)
 *     description: The `meta.summary` block carries the weighted average and a per-exam-type breakdown.
 *     tags: [Grades]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: examType
 *         schema: { $ref: '#/components/schemas/ExamType' }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/me', studentOnly, validate(schemas.list), controller.listMine);

/**
 * @swagger
 * /grades/exam-types:
 *   get:
 *     summary: List the supported exam types
 *     tags: [Grades]
 *     responses:
 *       200:
 *         description: Exam types returned
 *         content:
 *           application/json:
 *             example: { success: true, data: ["quiz", "assignment", "homework", "midterm", "final"] }
 */
router.get('/exam-types', controller.examTypes);

/**
 * @swagger
 * /grades/student/{studentId}:
 *   get:
 *     summary: List a student's grades
 *     description: >
 *       Instructors may read any student; a student requesting another student's
 *       id receives 403. Includes a `meta.summary` block.
 *     tags: [Grades]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: examType
 *         schema: { $ref: '#/components/schemas/ExamType' }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/student/:studentId', validate(schemas.listForStudent), controller.listForStudent);

router.use(instructorOnly);

/**
 * @swagger
 * /grades:
 *   post:
 *     summary: Add a grade
 *     description: >
 *       The student must be enrolled in the collection and `score` may not exceed
 *       `totalScore`. An exam dated in the future notifies enrolled students.
 *     tags: [Grades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [student, collectionId, examType, examDate, score, totalScore]
 *             properties:
 *               student: { type: string }
 *               collectionId: { type: string }
 *               examType: { $ref: '#/components/schemas/ExamType' }
 *               title: { type: string, example: "Unit 4 quiz" }
 *               examDate: { type: string, format: date-time }
 *               score: { type: number, example: 17 }
 *               totalScore: { type: number, example: 20 }
 *               homework: { type: string, description: Link this grade to an assignment }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Grade added }
 *       400: { description: Student not enrolled, or score exceeds totalScore }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: Search and list grades
 *     description: >
 *       Supports `?search=` over title and notes, plus filters and range
 *       operators such as `?score[gte]=15` and `?examDate[gte]=2026-01-01`.
 *     tags: [Grades]
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
 *         name: examType
 *         schema: { $ref: '#/components/schemas/ExamType' }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 */
router
  .route('/')
  .post(validate(schemas.create), controller.create)
  .get(validate(schemas.list), controller.list);

/**
 * @swagger
 * /grades/bulk:
 *   post:
 *     summary: Record one exam for many students
 *     description: Partial success — unenrolled students and out-of-range scores are reported under `skipped`.
 *     tags: [Grades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collectionId, examType, examDate, totalScore, scores]
 *             properties:
 *               collectionId: { type: string }
 *               examType: { $ref: '#/components/schemas/ExamType' }
 *               examDate: { type: string, format: date-time }
 *               title: { type: string }
 *               totalScore: { type: number }
 *               scores:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [student, score]
 *                   properties:
 *                     student: { type: string }
 *                     score: { type: number }
 *                     notes: { type: string }
 *     responses:
 *       201: { description: Grades recorded }
 */
router.post('/bulk', validate(schemas.createBulk), controller.createBulk);

/**
 * @swagger
 * /grades/upcoming:
 *   get:
 *     summary: Exams scheduled within the next N days
 *     tags: [Grades]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, minimum: 1, maximum: 90, default: 7 }
 *     responses:
 *       200: { description: Upcoming exams returned }
 */
router.get('/upcoming', validate(schemas.upcoming), controller.upcoming);

/**
 * @swagger
 * /grades/summary/student/{studentId}:
 *   get:
 *     summary: Grade summary for a student
 *     tags: [Grades]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
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
 *                 examCount: 8
 *                 totalScored: 132
 *                 totalPossible: 160
 *                 averagePercentage: 82.5
 *                 bestPercentage: 95
 *                 worstPercentage: 60
 *                 byExamType:
 *                   - { examType: "quiz", count: 5, averagePercentage: 84 }
 *                   - { examType: "midterm", count: 1, averagePercentage: 78 }
 */
router.get(
  '/summary/student/:studentId',
  validate({ params: z.object({ studentId: objectId }) }),
  controller.studentSummary
);

/**
 * @swagger
 * /grades/summary/collection/{collectionId}:
 *   get:
 *     summary: Class-wide grade averages per exam type
 *     tags: [Grades]
 *     parameters: [{ $ref: '#/components/parameters/CollectionIdParam' }]
 *     responses:
 *       200: { description: Summary returned }
 */
router.get(
  '/summary/collection/:collectionId',
  validate({ params: z.object({ collectionId: objectId }) }),
  controller.collectionSummary
);

/**
 * @swagger
 * /grades/{id}:
 *   get:
 *     summary: Get a grade
 *     tags: [Grades]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Grade returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a grade
 *     tags: [Grades]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               examType: { $ref: '#/components/schemas/ExamType' }
 *               title: { type: string }
 *               examDate: { type: string, format: date-time }
 *               score: { type: number }
 *               totalScore: { type: number }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Grade updated }
 *       400: { description: score exceeds totalScore }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete a grade
 *     tags: [Grades]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Grade deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(validate(schemas.update), controller.update)
  .delete(validate({ params: schemas.idParams }), controller.remove);

module.exports = router;
