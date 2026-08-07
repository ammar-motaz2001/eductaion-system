'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./collectionStudent.service');
const collectionService = require('../collections/collection.service');

/** Nested under `/collections/:collectionId`, so ids come from `req.params`. */

const addStudent = asyncHandler(async (req, res) => {
  const { collectionId } = req.params;
  const { student, students, notes } = req.body;

  if (students?.length) {
    const result = await service.addStudents(collectionId, students, req.user._id);
    return ApiResponse.created(
      res,
      result,
      `${result.enrolled.length} student(s) enrolled, ${result.skipped.length} skipped`
    );
  }

  const enrolment = await service.addStudent(collectionId, student, req.user._id, notes);
  return ApiResponse.created(res, enrolment, 'Student enrolled successfully');
});

const listStudents = asyncHandler(async (req, res) => {
  await collectionService.assertStudentHasAccess(req.user, req.params.collectionId);
  const page = await service.listStudents(req.params.collectionId, req.query);
  return ApiResponse.paginated(res, page, 'Collection students retrieved successfully');
});

const listEnrolments = asyncHandler(async (req, res) => {
  const page = await service.listEnrolments(req.params.collectionId, req.query);
  return ApiResponse.paginated(res, page, 'Enrolments retrieved successfully');
});

const removeStudent = asyncHandler(async (req, res) => {
  const result = await service.removeStudent(
    req.params.collectionId,
    req.params.studentId,
    req.user._id
  );
  return ApiResponse.ok(res, result, 'Student removed from collection successfully');
});

const setActive = asyncHandler(async (req, res) => {
  const enrolment = await service.setActive(
    req.params.collectionId,
    req.params.studentId,
    req.body.isActive
  );
  return ApiResponse.ok(
    res,
    enrolment,
    req.body.isActive ? 'Enrolment reactivated' : 'Enrolment suspended'
  );
});

/** Mounted at `/students/:studentId/collections`. */
const listCollectionsForStudent = asyncHandler(async (req, res) => {
  const page = await service.listCollectionsForStudent(req.params.studentId, req.query);
  return ApiResponse.paginated(res, page, 'Student collections retrieved successfully');
});

module.exports = {
  addStudent,
  listStudents,
  listEnrolments,
  removeStudent,
  setActive,
  listCollectionsForStudent,
};
