'use strict';

const { Router } = require('express');

const controller = require('./lesson.controller');
const schemas = require('./lesson.validation');
const validate = require('../../middlewares/validate.middleware');
const {
  authenticate,
  instructorOnly,
  requireActiveStudent,
} = require('../../middlewares/auth.middleware');
const { documentUploader, handleUploadErrors } = require('../../middlewares/upload.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Lessons
 *   description: Lesson material (PDF, images, Word, PowerPoint, video) per collection
 */

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /lessons:
 *   post:
 *     summary: Upload a lesson file
 *     description: >
 *       Accepts PDF, images, Word documents, PowerPoint, spreadsheets and video,
 *       up to `UPLOAD_MAX_FILE_SIZE_MB`. Lesson names must be unique inside a
 *       collection. If the database write fails the uploaded blob is removed, so
 *       no orphaned files accumulate.
 *     tags: [Lessons]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [collectionId, lessonName, file]
 *             properties:
 *               file: { type: string, format: binary }
 *               collectionId: { type: string }
 *               lessonName: { type: string, example: "Newton's Laws" }
 *               className: { type: string, example: "Week 3" }
 *               description: { type: string }
 *               order: { type: integer, default: 0 }
 *               isPublished: { type: boolean, default: true }
 *     responses:
 *       201: { description: Lesson uploaded }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       413: { description: File exceeds the configured size limit }
 *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
 *
 *   get:
 *     summary: List lessons
 *     tags: [Lessons]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: collection
 *         schema: { type: string }
 *       - in: query
 *         name: fileKind
 *         schema: { type: string, enum: [pdf, image, document, presentation, spreadsheet, video, other] }
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
    documentUploader.single('file'),
    handleUploadErrors,
    validate(schemas.upload),
    controller.upload
  )
  .get(instructorOnly, validate(schemas.list), controller.list);

/**
 * @swagger
 * /lessons/collection/{collectionId}:
 *   get:
 *     summary: List the lessons of a collection
 *     description: >
 *       Students may only read collections they are enrolled in and see published
 *       lessons only; instructors see drafts too.
 *     tags: [Lessons]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/collection/:collectionId',
  validate(schemas.listForCollection),
  controller.listForCollection
);

/**
 * @swagger
 * /lessons/{id}/download:
 *   get:
 *     summary: Download a lesson file
 *     description: >
 *       With local storage the file is streamed through the API so authorisation
 *       is enforced on every download. With a cloud provider the response is a
 *       302 redirect to the provider URL. Each call increments `downloadCount`.
 *     tags: [Lessons]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200:
 *         description: File stream
 *         content:
 *           application/octet-stream:
 *             schema: { type: string, format: binary }
 *       302: { description: Redirect to the storage provider URL }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/download', validate({ params: schemas.idParams }), controller.download);

/**
 * @swagger
 * /lessons/{id}:
 *   get:
 *     summary: Get a lesson's details
 *     tags: [Lessons]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Lesson returned }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a lesson, optionally replacing its file
 *     description: Send `multipart/form-data` with a new `file` to replace the stored one.
 *     tags: [Lessons]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               lessonName: { type: string }
 *               className: { type: string }
 *               description: { type: string }
 *               order: { type: integer }
 *               isPublished: { type: boolean }
 *     responses:
 *       200: { description: Lesson updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     summary: Soft-delete a lesson
 *     description: The stored file is kept so the lesson can be restored; use `?purge=true` semantics via the purge endpoint to delete it permanently.
 *     tags: [Lessons]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Lesson deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: schemas.idParams }), controller.getOne)
  .patch(
    instructorOnly,
    documentUploader.single('file'),
    handleUploadErrors,
    validate(schemas.update),
    controller.update
  )
  .delete(instructorOnly, validate({ params: schemas.idParams }), controller.remove);

/**
 * @swagger
 * /lessons/{id}/purge:
 *   delete:
 *     summary: Permanently delete a lesson and its stored file
 *     tags: [Lessons]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Lesson permanently deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/:id/purge',
  instructorOnly,
  validate({ params: schemas.idParams }),
  controller.purge
);

module.exports = router;
