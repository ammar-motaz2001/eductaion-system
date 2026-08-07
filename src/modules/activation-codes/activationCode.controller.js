'use strict';

const asyncHandler = require('../../core/asyncHandler');
const ApiResponse = require('../../core/ApiResponse');
const service = require('./activationCode.service');

const issue = asyncHandler(async (req, res) => {
  const codes = await service.issue(req.body, req.user._id);
  return ApiResponse.created(
    res,
    codes,
    `${codes.length} activation code${codes.length === 1 ? '' : 's'} generated successfully`
  );
});

const list = asyncHandler(async (req, res) => {
  const page = await service.list(req.query);
  return ApiResponse.paginated(res, page, 'Activation codes retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const code = await service.getById(req.params.id);
  return ApiResponse.ok(res, code, 'Activation code retrieved successfully');
});

/** Public pre-check used by the registration form. */
const verify = asyncHandler(async (req, res) => {
  const result = await service.verify(req.params.code);
  return ApiResponse.ok(res, result, result.valid ? 'Activation code is valid' : result.reason);
});

const revoke = asyncHandler(async (req, res) => {
  const code = await service.revoke(req.params.id, req.user._id);
  return ApiResponse.ok(res, code, 'Activation code revoked successfully');
});

const extend = asyncHandler(async (req, res) => {
  const code = await service.extend(req.params.id, req.body.days);
  return ApiResponse.ok(res, code, 'Activation code expiry extended successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Activation code deleted successfully');
});

const statistics = asyncHandler(async (req, res) => {
  const stats = await service.statistics();
  return ApiResponse.ok(res, stats, 'Activation code statistics retrieved successfully');
});

module.exports = { issue, list, getOne, verify, revoke, extend, remove, statistics };
