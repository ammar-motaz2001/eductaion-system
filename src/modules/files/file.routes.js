'use strict';

const { Router } = require('express');

const controller = require('./file.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: >
 *     Serve any uploaded file by its storage `key`. Every file descriptor in the
 *     API (profile images, lesson files, homework attachments) exposes that key.
 */

router.use(authenticate);

/**
 * @swagger
 * /files/{key}:
 *   get:
 *     summary: Display or download a stored file by its key
 *     description: >
 *       Takes the `key` from any file descriptor returned by the API — for
 *       example `users/665f.../avatar-1722384000-ab12.png` — and returns the
 *       bytes. Renders inline by default so the URL works directly as an
 *       `<img>` source; pass `?download=true` to force a save dialog.
 *
 *
 *       With local storage the file is streamed through the API, so access is
 *       authenticated. With a cloud provider the response is a 302 redirect to
 *       the provider URL.
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *         description: Storage key; may contain slashes
 *         example: users/665f1c2e9b1e8a0012ab34cd/avatar-1722384000-ab12cd.png
 *       - in: query
 *         name: download
 *         schema: { type: boolean, default: false }
 *         description: Force a download instead of inline rendering
 *     responses:
 *       200:
 *         description: File contents
 *         content:
 *           image/*:
 *             schema: { type: string, format: binary }
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *           application/octet-stream:
 *             schema: { type: string, format: binary }
 *       302: { description: Redirect to the storage provider URL }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/*', controller.serve);

module.exports = router;
