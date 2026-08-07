'use strict';

const { Router } = require('express');

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const validate = require('../../middlewares/validate.middleware');
const { authenticate, instructorOnly } = require('../../middlewares/auth.middleware');
const { z } = require('../../utils/validators');
const service = require('./dashboard.service');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Aggregated statistics across students, content, attendance and finance
 */

router.use(authenticate, instructorOnly);

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Full dashboard statistics
 *     description: >
 *       Aggregates every headline figure in one call: student counts, content
 *       totals, today's attendance, payment status totals, revenue/expenses/net
 *       profit, activation-code counts and unread notifications. Overdue payments
 *       are swept to `late` before the figures are computed, so nothing is stale.
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Dashboard returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Dashboard statistics retrieved successfully"
 *               data:
 *                 students: { total: 132, active: 120, pending: 12, attendanceWarnings: 7, averageAttendancePercentage: 82.4 }
 *                 content: { totalCollections: 9, activeCollections: 8, totalLessons: 146, totalHomework: 58, totalAttachments: 23, totalGrades: 412 }
 *                 attendance:
 *                   today: { pending: 3, present: 42, absent: 5, total: 50, attendancePercentage: 89.36 }
 *                   pendingApprovals: 3
 *                   warningThreshold: 50
 *                   warnings: 7
 *                 payments:
 *                   pending: { count: 12, total: 6000 }
 *                   paid: { count: 48, total: 24000 }
 *                   late: { count: 5, total: 2500 }
 *                   outstanding: 8500
 *                 finance: { totalRevenue: 128400, totalExpenses: 74200, netProfit: 54200 }
 *                 activationCodes: { unused: 12, used: 45, revoked: 2, expired: 3 }
 *                 notifications: { unread: 7 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await service.overview(req.user._id),
      'Dashboard statistics retrieved successfully'
    )
  )
);

/**
 * @swagger
 * /dashboard/quick-stats:
 *   get:
 *     summary: Compact tile set for a header strip
 *     description: Cheaper than the full dashboard; suitable for frequent polling.
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Quick stats returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: { totalStudents: 132, activeStudents: 120, pendingStudents: 12, attendanceToday: 89.36, outstandingPayments: 8500, attendanceWarnings: 7 }
 */
router.get(
  '/quick-stats',
  asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await service.quickStats(), 'Quick statistics retrieved successfully')
  )
);

/**
 * @swagger
 * /dashboard/action-items:
 *   get:
 *     summary: Everything currently awaiting an instructor decision
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Action items returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: { pendingStudentApprovals: 12, pendingAttendanceApprovals: 3, latePayments: 5, unreadCriticalNotifications: 4, total: 20 }
 */
router.get(
  '/action-items',
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await service.actionItems(req.user._id),
      'Action items retrieved successfully'
    )
  )
);

/**
 * @swagger
 * /dashboard/trends:
 *   get:
 *     summary: Monthly financial trend plus lesson-type breakdown
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: months
 *         schema: { type: integer, minimum: 1, maximum: 36, default: 6 }
 *     responses:
 *       200: { description: Trends returned }
 */
router.get(
  '/trends',
  validate({
    query: z.object({ months: z.coerce.number().int().min(1).max(36).optional().default(6) }),
  }),
  asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await service.trends(req.query.months), 'Trends retrieved successfully')
  )
);

/**
 * @swagger
 * /dashboard/recent-activity:
 *   get:
 *     summary: Most recently created students, payments, homework and lessons
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200: { description: Recent activity returned }
 */
router.get(
  '/recent-activity',
  validate({
    query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional().default(10) }),
  }),
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await service.recentActivity(req.query.limit),
      'Recent activity retrieved successfully'
    )
  )
);

module.exports = router;
