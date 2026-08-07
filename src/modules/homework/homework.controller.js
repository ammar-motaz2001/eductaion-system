'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./homework.service');

const create = asyncHandler(async (req, res) => {
  const homework = await service.createHomework(req.body, req.files || [], req.user._id);
  return ApiResponse.created(res, homework, 'Homework created successfully');
});

const list = asyncHandler(async (req, res) => {
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Homework retrieved successfully');
});

const listMine = asyncHandler(async (req, res) => {
  const page = await service.listForStudent(req.user, req.query);
  return ApiResponse.paginated(res, page, 'Your homework retrieved successfully');
});

const listForCollection = asyncHandler(async (req, res) => {
  const page = await service.listForCollection(req.user, req.params.collectionId, req.query);
  return ApiResponse.paginated(res, page, 'Collection homework retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const homework = await service.getForUser(req.user, req.params.id);
  return ApiResponse.ok(res, homework, 'Homework retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const homework = await service.updateHomework(req.params.id, req.body);
  return ApiResponse.ok(res, homework, 'Homework updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeHomework(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Homework deleted successfully');
});

const addAttachments = asyncHandler(async (req, res) => {
  const homework = await service.addAttachments(req.params.id, req.files || []);
  return ApiResponse.created(res, homework, 'Attachments added successfully');
});

const removeAttachment = asyncHandler(async (req, res) => {
  const homework = await service.removeAttachment(req.params.id, req.body.key);
  return ApiResponse.ok(res, homework, 'Attachment removed successfully');
});

const upcoming = asyncHandler(async (req, res) => {
  const items = await service.listUpcoming(req.query.days);
  return ApiResponse.ok(res, items, 'Upcoming homework retrieved successfully');
});

module.exports = {
  create,
  list,
  listMine,
  listForCollection,
  getOne,
  update,
  remove,
  addAttachments,
  removeAttachment,
  upcoming,
};
