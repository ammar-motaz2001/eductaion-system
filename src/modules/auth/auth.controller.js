'use strict';

const asyncHandler = require('../../core/asyncHandler');
const ApiResponse = require('../../core/ApiResponse');
const authService = require('./auth.service');

/**
 * HTTP adapter for the auth service.
 *
 * Controllers stay deliberately thin: read the request, call one service method,
 * shape the response. No business rules live here.
 */

/** Client fingerprint recorded against each refresh session. */
const sessionContext = (req) => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip,
});

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerStudent(req.body);
  return ApiResponse.created(res, result, result.message);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, sessionContext(req));
  return ApiResponse.ok(res, result, 'Signed in successfully');
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body, sessionContext(req));
  return ApiResponse.ok(res, result, 'Token refreshed successfully');
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user, req.body);
  return ApiResponse.ok(res, result, 'Signed out successfully');
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user._id, req.body);
  return ApiResponse.ok(res, null, result.message);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return ApiResponse.ok(
    res,
    result.resetToken ? { resetToken: result.resetToken } : null,
    result.message
  );
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  return ApiResponse.ok(res, null, result.message);
});

const me = asyncHandler(async (req, res) => {
  const result = await authService.me(req.user);
  return ApiResponse.ok(res, result, 'Profile retrieved successfully');
});

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.listSessions(req.user._id);
  return ApiResponse.ok(res, sessions, 'Active sessions retrieved successfully');
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  me,
  listSessions,
};
