'use strict';

const { Router } = require('express');

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const validate = require('../../middlewares/validate.middleware');
const { instructorOnly } = require('../../middlewares/auth.middleware');
const {
  z,
  objectId,
  isoDate,
  money,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
  nonEmptyObject,
} = require('../../utils/validators');

/**
 * Builds the controller, validators and router for a financial ledger.
 *
 * Revenue and Expense expose byte-for-byte identical REST surfaces, so they are
 * generated from one definition rather than maintained as two near-copies that
 * would inevitably drift.
 */

/** @param {string[]} categories */
function buildValidators(categories) {
  const category = z.enum(categories);

  return {
    create: {
      body: z.object({
        title: shortText(200).min(2, 'Title is required'),
        amount: money,
        currency: z.string().trim().length(3).toUpperCase().optional(),
        category,
        date: isoDate.optional(),
        notes: longText(2000).optional(),
        student: objectId.optional(),
        collectionId: objectId.optional(),
      }),
    },
    update: {
      params: idParams,
      body: nonEmptyObject(
        z.object({
          title: shortText(200).min(2).optional(),
          amount: money.optional(),
          currency: z.string().trim().length(3).toUpperCase().optional(),
          category: category.optional(),
          date: isoDate.optional(),
          notes: longText(2000).optional(),
        })
      ),
    },
    list: {
      query: paginationQuery.extend({
        category: filterValue(category),
        collection: filterValue(objectId),
        student: filterValue(objectId),
        date: filterValue(),
        amount: filterValue(),
      }),
    },
    series: {
      query: z.object({ months: z.coerce.number().int().min(1).max(60).optional().default(12) }),
    },
    monthly: {
      query: z.object({
        year: z.coerce.number().int().min(2000).max(2100).optional(),
        month: z.coerce.number().int().min(1).max(12).optional(),
      }),
    },
    idParams,
  };
}

/**
 * @param {import('./TransactionService')} service
 * @param {string} label Human label used in response messages, e.g. "Revenue".
 */
function buildController(service, label) {
  return {
    create: asyncHandler(async (req, res) => {
      const entry = await service.createEntry(req.body, req.user._id);
      return ApiResponse.created(res, entry, `${label} created successfully`);
    }),

    list: asyncHandler(async (req, res) => {
      const page = await service.list(req.query);
      return ApiResponse.paginated(res, page, `${label} entries retrieved successfully`);
    }),

    getOne: asyncHandler(async (req, res) => {
      const entry = await service.getById(req.params.id);
      return ApiResponse.ok(res, entry, `${label} retrieved successfully`);
    }),

    update: asyncHandler(async (req, res) => {
      const entry = await service.update(req.params.id, req.body);
      return ApiResponse.ok(res, entry, `${label} updated successfully`);
    }),

    remove: asyncHandler(async (req, res) => {
      const result = await service.remove(req.params.id, req.user._id);
      return ApiResponse.ok(res, result, `${label} deleted successfully`);
    }),

    overview: asyncHandler(async (req, res) => {
      const result = await service.overview();
      return ApiResponse.ok(res, result, `${label} overview retrieved successfully`);
    }),

    series: asyncHandler(async (req, res) => {
      const result = await service.monthlySeries(req.query.months);
      return ApiResponse.ok(res, result, `Monthly ${label.toLowerCase()} retrieved successfully`);
    }),

    monthly: asyncHandler(async (req, res) => {
      const total = await service.monthlyTotal(req.query.year, req.query.month);
      return ApiResponse.ok(
        res,
        { year: req.query.year || null, month: req.query.month || null, total },
        `Monthly ${label.toLowerCase()} total retrieved successfully`
      );
    }),

    categories: asyncHandler(async (req, res) =>
      ApiResponse.ok(res, service.availableCategories(), 'Categories retrieved successfully')
    ),
  };
}

/**
 * Assemble a complete ledger router. Swagger paths are declared in the concrete
 * route files so each ledger documents its own URLs and category vocabulary.
 *
 * @param {import('./TransactionService')} service
 * @param {{label: string, categories: string[]}} options
 */
function buildTransactionRouter(service, { label, categories }) {
  const schemas = buildValidators(categories);
  const controller = buildController(service, label);
  const router = Router();

  // Financial data is instructor-only across the board.
  router.use(instructorOnly);

  router
    .route('/')
    .post(validate(schemas.create), controller.create)
    .get(validate(schemas.list), controller.list);

  router.get('/overview', controller.overview);
  router.get('/monthly', validate(schemas.monthly), controller.monthly);
  router.get('/series', validate(schemas.series), controller.series);
  router.get('/categories', controller.categories);

  router
    .route('/:id')
    .get(validate({ params: schemas.idParams }), controller.getOne)
    .patch(validate(schemas.update), controller.update)
    .delete(validate({ params: schemas.idParams }), controller.remove);

  return { router, controller, schemas };
}

module.exports = { buildTransactionRouter, buildValidators, buildController };
