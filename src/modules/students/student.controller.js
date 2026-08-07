'use strict';

const ApiError = require('../../core/ApiError');
const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./student.service');

const create = asyncHandler(async (req, res) => {
  const result = await service.createStudent(req.body, req.user._id);
  return ApiResponse.created(
    res,
    result,
    result.credentials
      ? 'Student created successfully. Share the temporary password shown here — it will not be retrievable again.'
      : 'Student created successfully'
  );
});

const list = asyncHandler(async (req, res) => {
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Students retrieved successfully');
});

const listPending = asyncHandler(async (req, res) => {
  const page = await service.listPending(req.query);
  return ApiResponse.paginated(res, page, 'Pending students retrieved successfully');
});

/** Instructors may read any student; students only their own record. */
const getOne = asyncHandler(async (req, res) => {
  const id = await service.resolveAccessibleStudentId(req.user, req.params.id);
  const student = await service.getById(id);
  return ApiResponse.ok(res, student, 'Student retrieved successfully');
});

const getOwnProfile = asyncHandler(async (req, res) => {
  const student = await service.getOwnProfile(req.user._id);
  return ApiResponse.ok(res, student, 'Profile retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const student = await service.updateStudent(req.params.id, req.body, req.user._id);
  return ApiResponse.ok(res, student, 'Student updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removeStudent(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Student deleted successfully');
});

const restore = asyncHandler(async (req, res) => {
  const student = await service.restore(req.params.id);
  return ApiResponse.ok(res, student, 'Student restored successfully');
});

const approve = asyncHandler(async (req, res) => {
  const student = await service.approve(req.params.id, req.user._id);
  return ApiResponse.ok(res, student, 'Student approved and activated successfully');
});

const revokeApproval = asyncHandler(async (req, res) => {
  const student = await service.revokeApproval(req.params.id);
  return ApiResponse.ok(res, student, 'Student approval revoked; account is pending again');
});

const setAccountActive = asyncHandler(async (req, res) => {
  const result = await service.setAccountActive(req.params.id, req.body.isActive);
  return ApiResponse.ok(
    res,
    result,
    result.isActive ? 'Student account enabled' : 'Student account disabled'
  );
});

const uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('A file is required in the "image" field');
  const student = await service.setProfileImage(req.params.id, req.file, req.user._id);
  return ApiResponse.ok(res, student, 'Profile image updated successfully');
});

const addNote = asyncHandler(async (req, res) => {
  const student = await service.addNote(req.params.id, req.body.body, req.user._id);
  return ApiResponse.created(res, student, 'Note added successfully');
});

const removeNote = asyncHandler(async (req, res) => {
  const student = await service.removeNote(req.params.id, req.params.noteId);
  return ApiResponse.ok(res, student, 'Note removed successfully');
});

const setPerformance = asyncHandler(async (req, res) => {
  const student = await service.setPerformance(req.params.id, req.body.performance);
  return ApiResponse.ok(res, student, 'Performance rating updated successfully');
});

module.exports = {
  create,
  list,
  listPending,
  getOne,
  getOwnProfile,
  update,
  remove,
  restore,
  approve,
  revokeApproval,
  setAccountActive,
  uploadProfileImage,
  addNote,
  removeNote,
  setPerformance,
};
