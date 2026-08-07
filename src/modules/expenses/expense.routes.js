'use strict';

const { Router } = require('express');

const { buildTransactionRouter } = require('../finance/transaction.factory');
const { authenticate } = require('../../middlewares/auth.middleware');
const { TRANSACTION_CATEGORIES } = require('../../core/constants');
const expenseService = require('./expense.service');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Expenses
 *   description: Outgoing ledger — rent, salaries, utilities, equipment, marketing, maintenance
 */

/**
 * @swagger
 * /expenses:
 *   post:
 *     summary: Create an expense entry
 *     tags: [Expenses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransactionInput'
 *           example:
 *             title: "Studio rent — August"
 *             amount: 6000
 *             category: "rent"
 *             date: "2026-08-01"
 *     responses:
 *       201: { description: Expense created }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 *   get:
 *     summary: List expense entries
 *     tags: [Expenses]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [rent, salaries, utilities, equipment, marketing, maintenance, other] }
 *       - in: query
 *         name: date
 *         schema: { type: string }
 *         description: Supports range operators, e.g. `date[gte]=2026-01-01`
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *
 * /expenses/overview:
 *   get:
 *     summary: Total expenses, this month's expenses and a per-category breakdown
 *     tags: [Expenses]
 *     responses:
 *       200: { description: Overview returned }
 *
 * /expenses/monthly:
 *   get:
 *     summary: Expense total for a specific month
 *     tags: [Expenses]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *     responses:
 *       200: { description: Monthly total returned }
 *
 * /expenses/series:
 *   get:
 *     summary: Monthly expense time series
 *     tags: [Expenses]
 *     parameters:
 *       - in: query
 *         name: months
 *         schema: { type: integer, minimum: 1, maximum: 60, default: 12 }
 *     responses:
 *       200: { description: Series returned }
 *
 * /expenses/categories:
 *   get:
 *     summary: List the valid expense categories
 *     tags: [Expenses]
 *     responses:
 *       200: { description: Categories returned }
 *
 * /expenses/{id}:
 *   get:
 *     summary: Get an expense entry
 *     tags: [Expenses]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Expense returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update an expense entry
 *     tags: [Expenses]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TransactionInput' }
 *     responses:
 *       200: { description: Expense updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Soft-delete an expense entry
 *     tags: [Expenses]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Expense deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
const { router: ledgerRouter } = buildTransactionRouter(expenseService, {
  label: 'Expense',
  categories: TRANSACTION_CATEGORIES.EXPENSE,
});

router.use(authenticate, ledgerRouter);

module.exports = router;
