'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./grade.service');

const create = asyncHandler(async (req, res) => {
  const grade = await service.addGrade(req.body, req.user._id);
  return ApiResponse.created(res, grade, 'Grade added successfully');
});

const createBulk = asyncHandler(async (req, res) => {
  const result = await service.addBulk(req.body, req.user._id);
  return ApiResponse.created(
    res,
    result,
    `${result.recorded.length} grade(s) recorded, ${result.skipped.length} skipped`
  );
});

const list = asyncHandler(async (req, res) => {
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Grades retrieved successfully');
});

const listForStudent = asyncHandler(async (req, res) => {
  const page = await service.listForStudent(req.user, req.params.studentId, req.query);
  return ApiResponse.paginated(res, page, 'Student grades retrieved successfully');
});

const listMine = asyncHandler(async (req, res) => {
  const page = await service.listForStudent(req.user, null, req.query);
  return ApiResponse.paginated(res, page, 'Your grades retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const grade = await service.getById(req.params.id);
  return ApiResponse.ok(res, grade, 'Grade retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const grade = await service.updateGrade(req.params.id, req.body);
  return ApiResponse.ok(res, grade, 'Grade updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Grade deleted successfully');
});

const studentSummary = asyncHandler(async (req, res) => {
  const summary = await service.summaryForStudent(req.params.studentId, req.query.collection);
  return ApiResponse.ok(res, summary, 'Grade summary retrieved successfully');
});

const collectionSummary = asyncHandler(async (req, res) => {
  const summary = await service.summaryForCollection(req.params.collectionId);
  return ApiResponse.ok(res, summary, 'Collection grade summary retrieved successfully');
});

const upcoming = asyncHandler(async (req, res) => {
  const exams = await service.upcomingExams(req.query.days);
  return ApiResponse.ok(res, exams, 'Upcoming exams retrieved successfully');
});

const examTypes = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, service.examTypes(), 'Exam types retrieved successfully')
);

module.exports = {
  create,
  createBulk,
  list,
  listForStudent,
  listMine,
  getOne,
  update,
  remove,
  studentSummary,
  collectionSummary,
  upcoming,
  examTypes,
};
