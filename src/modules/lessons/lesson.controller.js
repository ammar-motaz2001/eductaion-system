'use strict';

const path = require('path');

const ApiError = require('../../core/ApiError');
const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const storageService = require('../../services/storage');
const service = require('./lesson.service');

const upload = asyncHandler(async (req, res) => {
  const lesson = await service.upload(req.body, req.file, req.user._id);
  return ApiResponse.created(res, lesson, 'Lesson uploaded successfully');
});

const list = asyncHandler(async (req, res) => {
  // Students may only browse lessons from collections they belong to; without an
  // explicit collection filter the listing is instructor-only.
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Lessons retrieved successfully');
});

const listForCollection = asyncHandler(async (req, res) => {
  const page = await service.listForCollection(req.user, req.params.collectionId, req.query);
  return ApiResponse.paginated(res, page, 'Collection lessons retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const lesson = await service.getForUser(req.user, req.params.id);
  return ApiResponse.ok(res, lesson, 'Lesson retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const lesson = await service.updateLesson(req.params.id, req.body, req.file);
  return ApiResponse.ok(res, lesson, 'Lesson updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeLesson(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Lesson deleted successfully');
});

const purge = asyncHandler(async (req, res) => {
  const result = await service.purgeLesson(req.params.id);
  return ApiResponse.ok(res, result, 'Lesson permanently deleted');
});

/**
 * Download a lesson file.
 *
 * Local storage streams the file through the API so authorisation is enforced;
 * a cloud provider returns a redirect to its (optionally signed) URL.
 */
const download = asyncHandler(async (req, res) => {
  const { lesson, downloadUrl, isLocal } = await service.prepareDownload(req.user, req.params.id);

  if (!isLocal) return res.redirect(302, downloadUrl);

  const absolutePath = storageService.absolutePathFor(lesson.file.key);
  if (!absolutePath) throw ApiError.notFound('Lesson file is no longer available');

  const filename = lesson.file.originalName || path.basename(lesson.file.key);
  return res.download(absolutePath, filename, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ success: false, message: 'Lesson file is no longer available' });
    }
  });
});

module.exports = { upload, list, listForCollection, getOne, update, remove, purge, download };
