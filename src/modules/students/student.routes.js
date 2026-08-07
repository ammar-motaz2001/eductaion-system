'use strict';

const { Router } = require('express');

const controller = require('./student.controller');
const schemas = require('./student.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate, instructorOnly } = require('../../middlewares/auth.middleware');
const { imageUploader, handleUploadErrors } = require('../../middlewares/upload.middleware');
const enrolmentController = require('../collection-students/collectionStudent.controller');
const { z, objectId, paginationQuery } = require('../../utils/validators');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Students
 *   description: Student profiles, approval workflow and academic metadata
 */

router.use(authenticate);

/**
 * @swagger
 * /students/me:
 *   get:
 *     summary: Get the signed-in student's own profile
 *     description: Available to students only; instructors use `/students/{id}`.
 *     tags: [Students]
 *     responses:
 *       200: { description: Profile returned }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/me', controller.getOwnProfile);

/**
 * @swagger
 * /students:
 *   post:
 *     summary: Create a student directly
 *     description: >
 *       Instructor-only shortcut that bypasses the activation-code flow and
 *       creates an already-active account. Omit `password` to have a temporary
 *       one generated — it is returned once in the response and never again.
 *     tags: [Students]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, phone, parentPhone, educationLevel]
 *             properties:
 *               fullName: { type: string, example: "Omar Khaled" }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, description: Generated when omitted }
 *               age: { type: integer, example: 17 }
 *               phone: { type: string, example: "+201234567890" }
 *               parentPhone: { type: string, example: "+201234567891" }
 *               educationLevel: { $ref: '#/components/schemas/EducationLevel' }
 *               school: { type: string }
 *               address: { $ref: '#/components/schemas/Address' }
 *               performance: { $ref: '#/components/schemas/PerformanceLevel' }
 *               collections:
 *                 type: array
 *                 items: { type: string }
 *                 description: Collections to enrol into immediately
 *     responses:
 *       201: { description: Student created }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: List students with search, filtering, sorting and pagination
 *     description: >
 *       Supports `?search=` across name, email, phones and school, plus filtering
 *       by `collection`, `educationLevel`, `status`, `performance` and
 *       `paymentStatus`. Range operators work on numeric fields, e.g.
 *       `?attendancePercentage[lt]=50`.
 *     tags: [Students]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *         description: Only students enrolled in this collection
 *       - in: query
 *         name: educationLevel
 *         schema: { $ref: '#/components/schemas/EducationLevel' }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active] }
 *       - in: query
 *         name: performance
 *         schema: { $ref: '#/components/schemas/PerformanceLevel' }
 *       - in: query
 *         name: paymentStatus
 *         schema: { type: string, enum: [pending, paid, late] }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router
  .route('/')
  .post(instructorOnly, validate(schemas.create), controller.create)
  .get(instructorOnly, validate(schemas.list), controller.list);

/**
 * @swagger
 * /students/pending:
 *   get:
 *     summary: List students awaiting approval
 *     tags: [Students]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/pending', instructorOnly, validate(schemas.list), controller.listPending);

/**
 * @swagger
 * /students/{studentId}/collections:
 *   get:
 *     summary: List the collections a student is enrolled in
 *     tags: [Students]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: Set the collections a student belongs to
 *     description: >
 *       Instructor-only. Replaces the student's full collection membership —
 *       collections omitted from the list are removed, new ones are added.
 *       Works for both pending and active students.
 *     tags: [Students]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collections]
 *             properties:
 *               collections:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["665f1c2e9b1e8a0012ab34cd", "665f1c2e9b1e8a0012ab34ce"]
 *     responses:
 *       200: { description: Collections updated }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router
  .route('/:studentId/collections')
  .get(
    instructorOnly,
    validate({ params: z.object({ studentId: objectId }), query: paginationQuery }),
    enrolmentController.listCollectionsForStudent
  )
  .put(
    instructorOnly,
    validate(schemas.setCollections),
    enrolmentController.setStudentCollections
  );

/**
 * @swagger
 * /students/{id}:
 *   get:
 *     summary: Get a student's details
 *     description: Instructors may read any student; a student may only read their own record.
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Student returned }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a student's profile
 *     description: >
 *       Email cannot be changed here (it is the login identifier) and collection
 *       membership is managed through the collection-students endpoints.
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               age: { type: integer }
 *               phone: { type: string }
 *               parentPhone: { type: string }
 *               educationLevel: { $ref: '#/components/schemas/EducationLevel' }
 *               school: { type: string }
 *               address: { $ref: '#/components/schemas/Address' }
 *               performance: { $ref: '#/components/schemas/PerformanceLevel' }
 *     responses:
 *       200: { description: Student updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     summary: Soft-delete a student
 *     description: >
 *       Cascades to the login account and enrolments. Grades, attendance and
 *       payments are retained so history stays auditable.
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Student deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(instructorOnly, validate(schemas.update), controller.update)
  .delete(instructorOnly, validate({ params: schemas.idParams }), controller.remove);

router.use(instructorOnly);

/**
 * @swagger
 * /students/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted student
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Student restored }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/restore', validate({ params: schemas.idParams }), controller.restore);

/**
 * @swagger
 * /students/{id}/approve:
 *   patch:
 *     summary: Approve a pending student
 *     description: Sets both the profile and the login account to `active` and emails the student.
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Student approved }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/approve', validate({ params: schemas.idParams }), controller.approve);

/**
 * @swagger
 * /students/{id}/revoke-approval:
 *   patch:
 *     summary: Return an active student to pending status
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Approval revoked }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  '/:id/revoke-approval',
  validate({ params: schemas.idParams }),
  controller.revokeApproval
);

/**
 * @swagger
 * /students/{id}/account-status:
 *   patch:
 *     summary: Enable or disable a student's login
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
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
 *       200: { description: Account status updated }
 */
router.patch(
  '/:id/account-status',
  validate(schemas.setAccountActive),
  controller.setAccountActive
);

/**
 * @swagger
 * /students/{id}/profile-image:
 *   patch:
 *     summary: Upload or replace a student's profile image
 *     description: Accepts a single image (JPEG, PNG, WebP, GIF, BMP or SVG) up to 5 MB.
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: Image updated }
 *       413: { description: File exceeds the size limit }
 *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
 */
router.patch(
  '/:id/profile-image',
  validate({ params: schemas.idParams }),
  imageUploader.single('image'),
  handleUploadErrors,
  controller.uploadProfileImage
);

/**
 * @swagger
 * /students/{id}/notes:
 *   post:
 *     summary: Add an instructor note to a student
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 2000, example: "Improved noticeably in algebra this month." }
 *     responses:
 *       201: { description: Note added }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/notes', validate(schemas.addNote), controller.addNote);

/**
 * @swagger
 * /students/{id}/notes/{noteId}:
 *   delete:
 *     summary: Remove a note from a student
 *     tags: [Students]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Note removed }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id/notes/:noteId', validate(schemas.removeNote), controller.removeNote);

/**
 * @swagger
 * /students/{id}/performance:
 *   patch:
 *     summary: Set a student's performance rating
 *     tags: [Students]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [performance]
 *             properties:
 *               performance: { $ref: '#/components/schemas/PerformanceLevel' }
 *     responses:
 *       200: { description: Performance updated }
 */
router.patch('/:id/performance', validate(schemas.setPerformance), controller.setPerformance);

module.exports = router;
