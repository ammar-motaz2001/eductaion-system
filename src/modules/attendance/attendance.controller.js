'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./attendance.service');

const submit = asyncHandler(async (req, res) => {
  const record = await service.submit(req.user, req.body);
  return ApiResponse.created(
    res,
    record,
    'Attendance submitted successfully and is awaiting instructor review'
  );
});

const record = asyncHandler(async (req, res) => {
  const created = await service.record(req.body, req.user._id);
  return ApiResponse.created(res, created, 'Attendance recorded successfully');
});

const recordBulk = asyncHandler(async (req, res) => {
  const result = await service.recordBulk(req.body, req.user._id);
  return ApiResponse.created(
    res,
    result,
    `${result.recorded.length} record(s) saved, ${result.skipped.length} skipped`
  );
});

const review = asyncHandler(async (req, res) => {
  const updated = await service.review(
    req.params.id,
    req.body.status,
    req.user._id,
    req.body.notes
  );
  return ApiResponse.ok(res, updated, `Attendance marked as ${req.body.status}`);
});

const list = asyncHandler(async (req, res) => {
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Attendance records retrieved successfully');
});

const listMine = asyncHandler(async (req, res) => {
  const page = await service.listForStudentUser(req.user, req.query);
  return ApiResponse.paginated(res, page, 'Your attendance records retrieved successfully');
});

const listPending = asyncHandler(async (req, res) => {
  const page = await service.listPending(req.query);
  return ApiResponse.paginated(res, page, 'Pending attendance records retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const found = await service.getById(req.params.id);
  return ApiResponse.ok(res, found, 'Attendance record retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.updateRecord(req.params.id, req.body, req.user._id);
  return ApiResponse.ok(res, updated, 'Attendance record updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeRecord(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Attendance record deleted successfully');
});

const summary = asyncHandler(async (req, res) => {
  const result = await service.summaryForStudent(req.user, req.query.student, req.query.collection);
  return ApiResponse.ok(res, result, 'Attendance summary retrieved successfully');
});

const collectionDay = asyncHandler(async (req, res) => {
  const result = await service.collectionDay(req.params.collectionId, req.query.date);
  return ApiResponse.ok(res, result, 'Collection attendance retrieved successfully');
});

const todaySummary = asyncHandler(async (req, res) => {
  const result = await service.todaySummary();
  return ApiResponse.ok(res, result, "Today's attendance summary retrieved successfully");
});

const recalculate = asyncHandler(async (req, res) => {
  const result = await service.recalculateAll();
  return ApiResponse.ok(res, result, 'Attendance statistics recalculated successfully');
});

module.exports = {
  submit,
  record,
  recordBulk,
  review,
  list,
  listMine,
  listPending,
  getOne,
  update,
  remove,
  summary,
  collectionDay,
  todaySummary,
  recalculate,
};
