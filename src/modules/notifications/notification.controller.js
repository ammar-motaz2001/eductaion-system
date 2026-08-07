'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./notification.service');

const list = asyncHandler(async (req, res) => {
  const page = await service.listForUser(req.user._id, req.query);
  return ApiResponse.paginated(res, page, 'Notifications retrieved successfully');
});

const summary = asyncHandler(async (req, res) => {
  const result = await service.summary(req.user._id);
  return ApiResponse.ok(res, result, 'Notification summary retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const notification = await service.getById(req.params.id, {
    baseFilter: { recipient: req.user._id },
  });
  return ApiResponse.ok(res, notification, 'Notification retrieved successfully');
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await service.markAsRead(req.params.id, req.user._id);
  return ApiResponse.ok(res, notification, 'Notification marked as read');
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await service.markAllAsRead(req.user._id);
  return ApiResponse.ok(res, result, `${result.modified} notification(s) marked as read`);
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeForUser(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Notification deleted successfully');
});

module.exports = { list, summary, getOne, markAsRead, markAllAsRead, remove };
