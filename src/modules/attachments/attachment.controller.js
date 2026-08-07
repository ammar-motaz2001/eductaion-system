'use strict';

const path = require('path');

const ApiError = require('../../core/ApiError');
const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const storageService = require('../../services/storage');
const service = require('./attachment.service');

const upload = asyncHandler(async (req, res) => {
  const attachment = await service.upload(req.body, req.file, req.user._id);
  return ApiResponse.created(res, attachment, 'Attachment uploaded successfully');
});

const list = asyncHandler(async (req, res) => {
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Attachments retrieved successfully');
});

const listForCollection = asyncHandler(async (req, res) => {
  const page = await service.listForCollection(req.user, req.params.collectionId, req.query);
  return ApiResponse.paginated(res, page, 'Collection attachments retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const attachment = await service.getById(req.params.id);
  await service.collections.assertStudentHasAccess(
    req.user,
    attachment.collectionId?._id || attachment.collectionId
  );
  return ApiResponse.ok(res, attachment, 'Attachment retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const attachment = await service.updateAttachment(req.params.id, req.body, req.file);
  return ApiResponse.ok(res, attachment, 'Attachment updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeAttachment(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Attachment deleted successfully');
});

const download = asyncHandler(async (req, res) => {
  const { attachment, downloadUrl, isLocal } = await service.prepareDownload(
    req.user,
    req.params.id
  );

  if (!isLocal) return res.redirect(302, downloadUrl);

  const absolutePath = storageService.absolutePathFor(attachment.file.key);
  if (!absolutePath) throw ApiError.notFound('Attachment file is no longer available');

  const filename = attachment.file.originalName || path.basename(attachment.file.key);
  return res.download(absolutePath, filename, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ success: false, message: 'Attachment file is no longer available' });
    }
  });
});

module.exports = { upload, list, listForCollection, getOne, update, remove, download };
