'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./collection.service');

const create = asyncHandler(async (req, res) => {
  const collection = await service.createCollection(req.body, req.user._id);
  return ApiResponse.created(res, collection, 'Collection created successfully');
});

const list = asyncHandler(async (req, res) => {
  const page = await service.listForUser(req.user, req.query);
  return ApiResponse.paginated(res, page, 'Collections retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  await service.assertStudentHasAccess(req.user, req.params.id);
  const collection = await service.getDetails(req.params.id);
  return ApiResponse.ok(res, collection, 'Collection retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const collection = await service.updateCollection(req.params.id, req.body);
  return ApiResponse.ok(res, collection, 'Collection updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeCollection(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Collection deleted successfully');
});

const restore = asyncHandler(async (req, res) => {
  const collection = await service.restore(req.params.id);
  return ApiResponse.ok(res, collection, 'Collection restored successfully');
});

const subjects = asyncHandler(async (req, res) => {
  const values = await service.distinctSubjects();
  return ApiResponse.ok(res, values, 'Subjects retrieved successfully');
});

module.exports = { create, list, getOne, update, remove, restore, subjects };
