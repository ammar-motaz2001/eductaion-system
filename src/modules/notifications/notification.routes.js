'use strict';

const { Router } = require('express');

const controller = require('./notification.controller');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { z, paginationQuery, idParams, filterValue } = require('../../utils/validators');
const { NOTIFICATION_TYPES, NOTIFICATION_SEVERITY } = require('../../core/constants');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: >
 *     In-app notifications generated automatically for attendance below the
 *     configured threshold, late payments, pending attendance approval, new
 *     homework, upcoming exams and pending student approval. Callers only ever
 *     see notifications addressed to them.
 */

router.use(authenticate);

const listSchema = {
  query: paginationQuery.extend({
    type: filterValue(z.enum(Object.values(NOTIFICATION_TYPES))),
    severity: filterValue(z.enum(Object.values(NOTIFICATION_SEVERITY))),
    isRead: filterValue(z.enum(['true', 'false'])),
  }),
};

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List your notifications
 *     tags: [Notifications]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [attendance-warning, late-payment, pending-attendance-approval, new-homework, upcoming-exam, pending-student-approval, general]
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [info, warning, critical] }
 *       - in: query
 *         name: isRead
 *         schema: { type: boolean }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', validate(listSchema), controller.list);

/**
 * @swagger
 * /notifications/summary:
 *   get:
 *     summary: Unread count and per-type breakdown
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Summary returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 unread: 7
 *                 breakdown:
 *                   - { type: "attendance-warning", count: 4 }
 *                   - { type: "late-payment", count: 3 }
 */
router.get('/summary', controller.summary);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark every notification as read
 *     tags: [Notifications]
 *     responses:
 *       200: { description: Notifications marked as read }
 */
router.patch('/read-all', controller.markAllAsRead);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification as read
 *     tags: [Notifications]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Notification marked as read }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/read', validate({ params: idParams }), controller.markAsRead);

/**
 * @swagger
 * /notifications/{id}:
 *   get:
 *     summary: Get one of your notifications
 *     tags: [Notifications]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Notification returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete one of your notifications
 *     tags: [Notifications]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Notification deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(validate({ params: idParams }), controller.getOne)
  .delete(validate({ params: idParams }), controller.remove);

module.exports = router;
