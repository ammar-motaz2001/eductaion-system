'use strict';

const logger = require('../../config/logger');
const BaseService = require('../../core/BaseService');
const ApiError = require('../../core/ApiError');
const { NOTIFICATION_TYPES, NOTIFICATION_SEVERITY, ROLES } = require('../../core/constants');
const notificationRepository = require('./notification.repository');
const userRepository = require('../users/user.repository');
const { formatDate } = require('../../utils/date.util');

/**
 * Notification generation and inbox management.
 *
 * Every emit path is failure-tolerant: a notification is a side effect of a
 * business action, so a delivery problem must never roll back the action that
 * triggered it. Errors are logged and swallowed.
 */
class NotificationService extends BaseService {
  constructor(repository = notificationRepository, users = userRepository) {
    super(repository, {
      resourceName: 'Notification',
      searchableFields: ['title', 'message'],
      filterableFields: ['type', 'severity', 'isRead:boolean', 'recipient:objectId'],
      sortableFields: ['createdAt', 'severity', 'isRead'],
      defaultSort: { createdAt: -1 },
    });
    this.users = users;
  }

  /** Ids of every active instructor — the default audience for admin alerts. */
  async #instructorIds() {
    const instructors = await this.users.findMany(
      { role: ROLES.INSTRUCTOR, isActive: true },
      { select: '_id' }
    );
    return instructors.map((instructor) => instructor._id);
  }

  /**
   * Emit one notification, deduplicated when `dedupeKey` is supplied.
   * @returns {Promise<object|null>} `null` when emission failed.
   */
  async emit({ recipient, type, title, message, severity, resource, data, dedupeKey }) {
    try {
      const payload = {
        type,
        title,
        message,
        severity: severity || NOTIFICATION_SEVERITY.INFO,
        resource: resource || { model: null, id: null },
        data: data || {},
      };
      if (dedupeKey) {
        return this.repository.upsertByDedupeKey({ recipient, dedupeKey, ...payload });
      }
      return this.repository.create({ recipient, ...payload });
    } catch (error) {
      logger.error('Notification emit failed', {
        type,
        recipient: String(recipient),
        error: error.message,
      });
      return null;
    }
  }

  /** Fan a notification out to several recipients. */
  async emitToMany(recipients, payload) {
    return Promise.all(
      (recipients || []).map((recipient) =>
        this.emit({
          ...payload,
          recipient,
          dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}` : undefined,
        })
      )
    );
  }

  /** Broadcast to all instructors. */
  async notifyInstructors(payload) {
    const recipients = await this.#instructorIds();
    return this.emitToMany(recipients, payload);
  }

  // ── Domain rules ──────────────────────────────────────────────────────────

  /**
   * Attendance dropped below the configured threshold.
   * Notifies the student and every instructor.
   */
  async attendanceWarning({ student, percentage, threshold }) {
    const message = `Attendance for ${student.fullName} is ${percentage}%, below the required ${threshold}%.`;
    const payload = {
      type: NOTIFICATION_TYPES.ATTENDANCE_WARNING,
      severity: NOTIFICATION_SEVERITY.WARNING,
      title: 'Low attendance warning',
      message,
      resource: { model: 'Student', id: student._id },
      data: { percentage, threshold, studentId: String(student._id) },
      dedupeKey: `attendance-warning:${student._id}`,
    };

    await this.notifyInstructors(payload);
    if (student.user) {
      await this.emit({
        ...payload,
        recipient: student.user,
        title: 'Your attendance is below the required minimum',
        message: `Your attendance is ${percentage}%. The minimum required is ${threshold}%.`,
      });
    }
  }

  /** A payment passed its due date without being settled. */
  async latePayment({ payment, student }) {
    const payload = {
      type: NOTIFICATION_TYPES.LATE_PAYMENT,
      severity: NOTIFICATION_SEVERITY.CRITICAL,
      title: 'Late payment',
      message: `Payment of ${payment.amount} for ${student?.fullName || 'a student'} was due on ${formatDate(payment.dueDate)}.`,
      resource: { model: 'Payment', id: payment._id },
      data: { amount: payment.amount, dueDate: payment.dueDate },
      dedupeKey: `late-payment:${payment._id}`,
    };

    await this.notifyInstructors(payload);
    if (student?.user) {
      await this.emit({
        ...payload,
        recipient: student.user,
        message: `Your payment of ${payment.amount} was due on ${formatDate(payment.dueDate)}. Please settle it as soon as possible.`,
      });
    }
  }

  /** A student submitted attendance that awaits instructor review. */
  async pendingAttendanceApproval({ attendance, student }) {
    return this.notifyInstructors({
      type: NOTIFICATION_TYPES.PENDING_ATTENDANCE_APPROVAL,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: 'Attendance awaiting review',
      message: `${student?.fullName || 'A student'} submitted attendance for ${formatDate(attendance.date)}.`,
      resource: { model: 'Attendance', id: attendance._id },
      data: { date: attendance.date },
      dedupeKey: `pending-attendance:${attendance._id}`,
    });
  }

  /** New homework published — notify every enrolled student. */
  async newHomework({ homework, studentUserIds }) {
    return this.emitToMany(studentUserIds, {
      type: NOTIFICATION_TYPES.NEW_HOMEWORK,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: 'New homework assigned',
      message: `"${homework.title}" is due on ${formatDate(homework.dueDate)}.`,
      resource: { model: 'Homework', id: homework._id },
      data: { dueDate: homework.dueDate, homeworkId: String(homework._id) },
    });
  }

  /** An exam is scheduled in the near future. */
  async upcomingExam({ grade, studentUserIds, examLabel }) {
    return this.emitToMany(studentUserIds, {
      type: NOTIFICATION_TYPES.UPCOMING_EXAM,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: 'Upcoming exam',
      message: `${examLabel} is scheduled for ${formatDate(grade.examDate)}.`,
      resource: { model: 'Grade', id: grade._id },
      data: { examDate: grade.examDate },
    });
  }

  /** A student registered and needs instructor approval. */
  async pendingStudentApproval({ student }) {
    return this.notifyInstructors({
      type: NOTIFICATION_TYPES.PENDING_STUDENT_APPROVAL,
      severity: NOTIFICATION_SEVERITY.WARNING,
      title: 'Student awaiting approval',
      message: `${student.fullName} registered and is awaiting approval.`,
      resource: { model: 'Student', id: student._id },
      data: { studentId: String(student._id), email: student.email },
      dedupeKey: `pending-student:${student._id}`,
    });
  }

  // ── Inbox operations ──────────────────────────────────────────────────────

  /** List the caller's own notifications. */
  async listForUser(userId, query) {
    return this.list(query, { recipient: userId });
  }

  async markAsRead(id, userId) {
    const updated = await this.repository.markAsRead(id, userId);
    if (!updated) throw ApiError.notFound('Notification not found');
    return updated;
  }

  async markAllAsRead(userId) {
    return this.repository.markAllAsRead(userId);
  }

  async summary(userId) {
    const [unread, breakdown] = await Promise.all([
      this.repository.countUnread(userId),
      this.repository.unreadBreakdown(userId),
    ]);
    return { unread, breakdown };
  }

  /** Delete one of the caller's own notifications. */
  async removeForUser(id, userId) {
    const existing = await this.repository.findOne(
      { _id: id, recipient: userId },
      { select: '_id' }
    );
    if (!existing) throw ApiError.notFound('Notification not found');
    await this.repository.deleteById(id, userId);
    return { id };
  }
}

module.exports = new NotificationService();
module.exports.NotificationService = NotificationService;
