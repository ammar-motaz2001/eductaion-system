'use strict';

const { Router } = require('express');

const controller = require('./attachment.controller');
const schemas = require('./attachment.validation');
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
 *   name: Attachments
 *   description: General files attached to a collection
 */

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /attachments:
 *   post:
 *     summary: Upload an attachment to a collection
 *     description: >
 *       `name` defaults to the uploaded file's original filename. Set
 *       `isVisibleToStudents=false` to keep the file instructor-only. Accepts the
 *       same types as lessons, including compressed archives (`.zip`, `.rar`,
 *       `.7z`, `.tar`, `.gz`, `.tgz`, `.bz2`), up to `UPLOAD_MAX_FILE_SIZE_MB`.
 *     tags: [Attachments]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [collectionId, file]
 *             properties:
 *               file: { type: string, format: binary }
 *               collectionId: { type: string }
 *               name: { type: string, example: "Term 1 syllabus" }
 *               description: { type: string }
 *               isVisibleToStudents: { type: boolean, default: true }
 *     responses:
 *       201: { description: Attachment uploaded }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
 *
 *   get:
 *     summary: List attachments
 *     tags: [Attachments]
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
 * /attachments/collection/{collectionId}:
 *   get:
 *     summary: List the attachments of a collection
 *     description: Students see only files marked visible, and only for collections they belong to.
 *     tags: [Attachments]
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionIdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
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
 * /attachments/{id}/download:
 *   get:
 *     summary: Download an attachment
 *     tags: [Attachments]
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
 * /attachments/{id}:
 *   get:
 *     summary: Get an attachment's details
 *     tags: [Attachments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Attachment returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update an attachment, optionally replacing the file
 *     tags: [Attachments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               name: { type: string }
 *               description: { type: string }
 *               isVisibleToStudents: { type: boolean }
 *     responses:
 *       200: { description: Attachment updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete an attachment and its stored file
 *     tags: [Attachments]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Attachment deleted }
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

module.exports = router;
