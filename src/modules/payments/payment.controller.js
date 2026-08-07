'use strict';

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const service = require('./payment.service');

const record = asyncHandler(async (req, res) => {
  const payment = await service.record(req.body, req.user._id);
  return ApiResponse.created(res, payment, 'Payment recorded successfully');
});

const list = asyncHandler(async (req, res) => {
  const page = await service.listPayments(req.query);
  return ApiResponse.paginated(res, page, 'Payments retrieved successfully');
});

const listForStudent = asyncHandler(async (req, res) => {
  const page = await service.listForStudent(req.user, req.params.studentId, req.query);
  return ApiResponse.paginated(res, page, 'Student payments retrieved successfully');
});

const listMine = asyncHandler(async (req, res) => {
  const page = await service.listForStudent(req.user, null, req.query);
  return ApiResponse.paginated(res, page, 'Your payments retrieved successfully');
});

const getOne = asyncHandler(async (req, res) => {
  const payment = await service.getById(req.params.id);
  return ApiResponse.ok(res, payment, 'Payment retrieved successfully');
});

const update = asyncHandler(async (req, res) => {
  const payment = await service.updatePayment(req.params.id, req.body);
  return ApiResponse.ok(res, payment, 'Payment updated successfully');
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.removePayment(req.params.id, req.user._id);
  return ApiResponse.ok(res, result, 'Payment deleted successfully');
});

const markAsPaid = asyncHandler(async (req, res) => {
  const { payment, alreadyPaid } = await service.markAsPaid(req.params.id, req.body, req.user._id);
  return ApiResponse.ok(
    res,
    payment,
    alreadyPaid ? 'Payment was already settled' : 'Payment marked as paid successfully'
  );
});

const markAsLate = asyncHandler(async (req, res) => {
  const payment = await service.markAsLate(req.params.id, req.body.notes);
  return ApiResponse.ok(res, payment, 'Payment marked as late successfully');
});

const reverse = asyncHandler(async (req, res) => {
  const payment = await service.reverse(req.params.id, req.user._id);
  return ApiResponse.ok(res, payment, 'Payment settlement reversed successfully');
});

const generateInvoices = asyncHandler(async (req, res) => {
  const result = await service.generateMonthlyInvoices(req.body, req.user._id);
  return ApiResponse.created(
    res,
    result,
    `${result.created.length} invoice(s) generated, ${result.skipped.length} skipped`
  );
});

const summary = asyncHandler(async (req, res) => {
  const result = await service.summary();
  return ApiResponse.ok(res, result, 'Payment summary retrieved successfully');
});

const paymentMethods = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, service.paymentMethods(), 'Payment methods retrieved successfully')
);

module.exports = {
  record,
  list,
  listForStudent,
  listMine,
  getOne,
  update,
  remove,
  markAsPaid,
  markAsLate,
  reverse,
  generateInvoices,
  summary,
  paymentMethods,
};
