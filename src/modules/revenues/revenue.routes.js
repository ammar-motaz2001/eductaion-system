'use strict';

const { Router } = require('express');

const { buildTransactionRouter } = require('../finance/transaction.factory');
const { authenticate } = require('../../middlewares/auth.middleware');
const { TRANSACTION_CATEGORIES } = require('../../core/constants');
const revenueService = require('./revenue.service');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Revenues
 *   description: Income ledger — tuition, subscriptions, books, exam fees, donations
 */

/**
 * @swagger
 * /revenues:
 *   post:
 *     summary: Create a revenue entry
 *     description: >
 *       Settling a student payment creates a revenue entry automatically; this
 *       endpoint is for income recorded manually (book sales, donations, …).
 *     tags: [Revenues]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransactionInput'
 *           example:
 *             title: "Textbook sales — August"
 *             amount: 1250
 *             category: "books"
 *             date: "2026-08-05"
 *             notes: "12 copies"
 *     responses:
 *       201: { description: Revenue created }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: List revenue entries
 *     tags: [Revenues]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [tuition, subscription, books, exam-fees, donation, other] }
 *       - in: query
 *         name: date
 *         schema: { type: string }
 *         description: Supports range operators, e.g. `date[gte]=2026-01-01`
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *
 * /revenues/overview:
 *   get:
 *     summary: Total revenue, this month's revenue and a per-category breakdown
 *     tags: [Revenues]
 *     responses:
 *       200:
 *         description: Overview returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 total: 128400
 *                 thisMonth: 18600
 *                 byCategory:
 *                   - { category: "tuition", total: 104000, count: 208 }
 *                   - { category: "books", total: 12400, count: 31 }
 *
 * /revenues/monthly:
 *   get:
 *     summary: Revenue total for a specific month
 *     description: Defaults to the current month when `year`/`month` are omitted.
 *     tags: [Revenues]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 8 }
 *     responses:
 *       200: { description: Monthly total returned }
 *
 * /revenues/series:
 *   get:
 *     summary: Monthly revenue time series
 *     tags: [Revenues]
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
 *                 - { year: 2026, month: 7, period: "2026-07", total: 17200, count: 44 }
 *                 - { year: 2026, month: 8, period: "2026-08", total: 18600, count: 47 }
 *
 * /revenues/categories:
 *   get:
 *     summary: List the valid revenue categories
 *     tags: [Revenues]
 *     responses:
 *       200: { description: Categories returned }
 *
 * /revenues/{id}:
 *   get:
 *     summary: Get a revenue entry
 *     tags: [Revenues]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Revenue returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update a revenue entry
 *     tags: [Revenues]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TransactionInput' }
 *     responses:
 *       200: { description: Revenue updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Soft-delete a revenue entry
 *     tags: [Revenues]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Revenue deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
const { router: ledgerRouter } = buildTransactionRouter(revenueService, {
  label: 'Revenue',
  categories: TRANSACTION_CATEGORIES.REVENUE,
});

router.use(authenticate, ledgerRouter);

module.exports = router;
