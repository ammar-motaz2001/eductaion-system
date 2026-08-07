'use strict';

const { Router } = require('express');

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const validate = require('../../middlewares/validate.middleware');
const { authenticate, instructorOnly } = require('../../middlewares/auth.middleware');
const { z } = require('../../utils/validators');
const financeService = require('./finance.service');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Finance
 *   description: Combined revenue/expense reporting — totals, net profit and monthly series
 */

router.use(authenticate, instructorOnly);

/**
 * @swagger
 * /finance/summary:
 *   get:
 *     summary: Financial summary — total revenue, total expenses, net profit and receivables
 *     tags: [Finance]
 *     responses:
 *       200:
 *         description: Summary returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Financial summary retrieved successfully"
 *               data:
 *                 totalRevenue: 128400
 *                 totalExpenses: 74200
 *                 netProfit: 54200
 *                 currentMonth: { period: "2026-08", revenue: 18600, expenses: 9100, netProfit: 9500 }
 *                 receivables:
 *                   outstanding: 8500
 *                   pending: { count: 12, total: 6000 }
 *                   late: { count: 5, total: 2500 }
 *                   paid: { count: 48, total: 24000 }
 *                   totalBilled: 32500
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/summary',
  asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await financeService.summary(), 'Financial summary retrieved successfully')
  )
);

/**
 * @swagger
 * /finance/monthly:
 *   get:
 *     summary: Revenue, expenses and net profit for one month
 *     description: Defaults to the current month when `year`/`month` are omitted.
 *     tags: [Finance]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 8 }
 *     responses:
 *       200: { description: Monthly summary returned }
 */
router.get(
  '/monthly',
  validate({
    query: z.object({
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await financeService.monthlySummary(req.query.year, req.query.month),
      'Monthly financial summary retrieved successfully'
    )
  )
);

/**
 * @swagger
 * /finance/series:
 *   get:
 *     summary: Monthly revenue/expense/profit series
 *     description: Every month in the window is present; months with no activity report zero.
 *     tags: [Finance]
 *     parameters:
 *       - in: query
 *         name: months
 *         schema: { type: integer, minimum: 1, maximum: 60, default: 12 }
 *     responses:
 *       200:
 *         description: Series returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - { period: "2026-07", year: 2026, month: 7, revenue: 17200, expenses: 8800, netProfit: 8400 }
 *                 - { period: "2026-08", year: 2026, month: 8, revenue: 18600, expenses: 9100, netProfit: 9500 }
 */
router.get(
  '/series',
  validate({
    query: z.object({ months: z.coerce.number().int().min(1).max(60).optional().default(12) }),
  }),
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await financeService.monthlySeries(req.query.months),
      'Monthly financial series retrieved successfully'
    )
  )
);

/**
 * @swagger
 * /finance/breakdown:
 *   get:
 *     summary: Category breakdown for both ledgers
 *     tags: [Finance]
 *     responses:
 *       200: { description: Breakdown returned }
 */
router.get(
  '/breakdown',
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await financeService.breakdown(),
      'Financial breakdown retrieved successfully'
    )
  )
);

module.exports = router;
