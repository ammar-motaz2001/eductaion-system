'use strict';

const { Router } = require('express');
const mongoose = require('mongoose');

const env = require('../config/env');
const ApiResponse = require('../core/ApiResponse');
const storageService = require('../services/storage');

const authRoutes = require('../modules/auth/auth.routes');
const activationCodeRoutes = require('../modules/activation-codes/activationCode.routes');
const studentRoutes = require('../modules/students/student.routes');
const collectionRoutes = require('../modules/collections/collection.routes');
const lessonRoutes = require('../modules/lessons/lesson.routes');
const homeworkRoutes = require('../modules/homework/homework.routes');
const attachmentRoutes = require('../modules/attachments/attachment.routes');
const attendanceRoutes = require('../modules/attendance/attendance.routes');
const gradeRoutes = require('../modules/grades/grade.routes');
const paymentRoutes = require('../modules/payments/payment.routes');
const revenueRoutes = require('../modules/revenues/revenue.routes');
const expenseRoutes = require('../modules/expenses/expense.routes');
const financeRoutes = require('../modules/finance/finance.routes');
const reportRoutes = require('../modules/reports/report.routes');
const notificationRoutes = require('../modules/notifications/notification.routes');
const settingRoutes = require('../modules/settings/setting.routes');
const fileRoutes = require('../modules/files/file.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');

const router = Router();

/**
 * API surface.
 *
 * One mount point per module keeps the URL space predictable and makes the whole
 * routing table readable in a single screen.
 */
const modules = [
  { path: '/auth', router: authRoutes },
  { path: '/activation-codes', router: activationCodeRoutes },
  { path: '/students', router: studentRoutes },
  { path: '/collections', router: collectionRoutes },
  { path: '/lessons', router: lessonRoutes },
  { path: '/homework', router: homeworkRoutes },
  { path: '/attachments', router: attachmentRoutes },
  { path: '/attendance', router: attendanceRoutes },
  { path: '/grades', router: gradeRoutes },
  { path: '/payments', router: paymentRoutes },
  { path: '/revenues', router: revenueRoutes },
  { path: '/expenses', router: expenseRoutes },
  { path: '/finance', router: financeRoutes },
  { path: '/reports', router: reportRoutes },
  { path: '/notifications', router: notificationRoutes },
  { path: '/settings', router: settingRoutes },
  { path: '/files', router: fileRoutes },
  { path: '/dashboard', router: dashboardRoutes },
];

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness and dependency check
 *     description: >
 *       Reports process uptime and MongoDB connectivity. Returns 503 when the
 *       database is unreachable, so it is safe to use as a readiness probe.
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: Service healthy
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Service is healthy"
 *               data:
 *                 status: "ok"
 *                 uptimeSeconds: 1284
 *                 database: "connected"
 *                 storage: "local"
 *                 mail: "configured (smtp.gmail.com:465)"
 *                 environment: "development"
 *       503: { description: A dependency is unavailable }
 */
router.get('/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const database = states[mongoose.connection.readyState] || 'unknown';
  const healthy = mongoose.connection.readyState === 1;

  return ApiResponse.send(res, {
    statusCode: healthy ? 200 : 503,
    message: healthy ? 'Service is healthy' : 'Service is degraded',
    data: {
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database,
      storage: storageService.providerName,
      // Not a live connection test — just whether the deployment was given SMTP
      // credentials at all, which is the usual reason mail goes missing.
      mail: env.mailEnabled ? `configured (${env.SMTP_HOST}:${env.SMTP_PORT})` : 'disabled',
      environment: env.NODE_ENV,
      version: require('../../package.json').version,
    },
  });
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API index
 *     description: Lists the available module mount points and documentation links.
 *     tags: [System]
 *     security: []
 *     responses:
 *       200: { description: Index returned }
 */
router.get('/', (_req, res) =>
  ApiResponse.ok(
    res,
    {
      name: `${env.APP_NAME} API`,
      version: require('../../package.json').version,
      documentation: '/docs',
      openapi: '/docs.json',
      endpoints: modules.map((module) => `${env.API_PREFIX}${module.path}`),
    },
    'Education Management System API'
  )
);

modules.forEach((module) => router.use(module.path, module.router));

module.exports = router;
