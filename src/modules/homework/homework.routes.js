'use strict';

const { Router } = require('express');

const controller = require('./homework.controller');
const schemas = require('./homework.validation');
const validate = require('../../middlewares/validate.middleware');
const {
  authenticate,
  instructorOnly,
  studentOnly,
  requireActiveStudent,
} = require('../../middlewares/auth.middleware');
const { documentUploader, handleUploadErrors } = require('../../middlewares/upload.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Homework
 *   description: Assignments issued to a collection, with optional attachments
 */

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /homework:
 *   post:
 *     summary: Create a homework assignment
 *     description: >
 *       Send as `multipart/form-data` to include attachments (field name
 *       `attachments`, up to 10 files). Publishing an assignment notifies every
 *       enrolled student.
 *     tags: [Homework]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [collectionId, title, dueDate]
 *             properties:
 *               collectionId: { type: string }
 *               title: { type: string, example: "Chapter 4 problem set" }
 *               description: { type: string }
 *               dueDate: { type: string, format: date-time, example: "2026-08-15T21:00:00.000Z" }
 *               totalScore: { type: number, nullable: true, example: 20 }
 *               isPublished: { type: boolean, default: true }
 *               attachments:
 *                 type: array
 *                 items: { type: string, format: binary }
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collectionId, title, dueDate]
 *             properties:
 *               collectionId: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               dueDate: { type: string, format: date-time }
 *               totalScore: { type: number, nullable: true }
 *               isPublished: { type: boolean }
 *     responses:
 *       201: { description: Homework created }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: List homework
 *     tags: [Homework]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: isPublished
 *         schema: { type: boolean }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router
  .route('/')
  .post(
    instructorOnly,
    uploadLimiter,
    documentUploader.array('attachments', 10),
    handleUploadErrors,
    validate(schemas.create),
    controller.create
  )
  .get(instructorOnly, validate(schemas.list), controller.list);

/**
 * @swagger
 * /homework/me:
 *   get:
 *     summary: List published homework across the signed-in student's collections
 *     tags: [Homework]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/me', studentOnly, validate(schemas.list), controller.listMine);

/**
 * @swagger
 * /homework/upcoming:
 *   get:
 *     summary: Homework due within the next N days
 *     tags: [Homework]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, minimum: 1, maximum: 90, default: 7 }
 *     responses:
 *       200: { description: Upcoming homework returned }
 */
router.get('/upcoming', instructorOnly, validate(schemas.upcoming), controller.upcoming);

/**
 * @swagger
 * /homework/collection/{collectionId}:
 *   get:
 *     summary: List the homework of a collection
 *     tags: [Homework]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/collection/:collectionId',
  validate(schemas.listForCollection),
  controller.listForCollection
);

/**
 * @swagger
 * /homework/{id}:
 *   get:
 *     summary: Get a homework assignment
 *     tags: [Homework]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Homework returned }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a homework assignment
 *     tags: [Homework]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               dueDate: { type: string, format: date-time }
 *               totalScore: { type: number, nullable: true }
 *               isPublished: { type: boolean }
 *     responses:
 *       200: { description: Homework updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete a homework assignment and its attachments
 *     tags: [Homework]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Homework deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(instructorOnly, validate(schemas.update), controller.update)
  .delete(instructorOnly, validate({ params: schemas.idParams }), controller.remove);

/**
 * @swagger
 * /homework/{id}/attachments:
 *   post:
 *     summary: Add attachments to an assignment
 *     tags: [Homework]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [attachments]
 *             properties:
 *               attachments:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201: { description: Attachments added }
 *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
 *   delete:
 *     summary: Remove one attachment by its storage key
 *     tags: [Homework]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key]
 *             properties:
 *               key: { type: string, description: The `file.key` of the attachment }
 *     responses:
 *       200: { description: Attachment removed }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id/attachments')
  .post(
    instructorOnly,
    uploadLimiter,
    documentUploader.array('attachments', 10),
    handleUploadErrors,
    validate({ params: schemas.idParams }),
    controller.addAttachments
  )
  .delete(instructorOnly, validate(schemas.removeAttachment), controller.removeAttachment);

module.exports = router;
