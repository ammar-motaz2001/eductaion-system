'use strict';

const env = require('../../config/env');
const { PAYMENT_STATUS, NOTIFICATION_TYPES } = require('../../core/constants');

const studentRepository = require('../students/student.repository');
const collectionRepository = require('../collections/collection.repository');
const lessonRepository = require('../lessons/lesson.repository');
const homeworkRepository = require('../homework/homework.repository');
const attachmentRepository = require('../attachments/attachment.repository');
const attendanceRepository = require('../attendance/attendance.repository');
const paymentRepository = require('../payments/payment.repository');
const activationCodeRepository = require('../activation-codes/activationCode.repository');
const notificationRepository = require('../notifications/notification.repository');
const gradeRepository = require('../grades/grade.repository');
const financeService = require('../finance/finance.service');
const paymentService = require('../payments/payment.service');

/**
 * Dashboard aggregation.
 *
 * Every figure is fetched concurrently — the endpoint touches nine collections,
 * and running them in series would make the landing page the slowest request in
 * the system.
 */
class DashboardService {
  constructor(dependencies = {}) {
    Object.assign(
      this,
      {
        students: studentRepository,
        collections: collectionRepository,
        lessons: lessonRepository,
        homework: homeworkRepository,
        attachments: attachmentRepository,
        attendance: attendanceRepository,
        payments: paymentRepository,
        activationCodes: activationCodeRepository,
        notifications: notificationRepository,
        grades: gradeRepository,
        finance: financeService,
        paymentsService: paymentService,
      },
      dependencies
    );
  }

  /**
   * Full dashboard payload.
   * @param {string} userId Recipient whose unread notification count is reported.
   */
  async overview(userId) {
    // Bring overdue payments current so the tiles cannot show a stale status.
    await this.paymentsService.refreshOverdueStatuses();

    const [
      studentStats,
      totalCollections,
      activeCollections,
      totalLessons,
      totalHomework,
      totalAttachments,
      todayAttendance,
      paymentSummary,
      financeSummary,
      pendingAttendance,
      activationCodeStats,
      unreadNotifications,
      totalGrades,
    ] = await Promise.all([
      this.students.statusCounts(env.ATTENDANCE_WARNING_THRESHOLD),
      this.collections.count({}),
      this.collections.count({ isActive: true }),
      this.lessons.count({}),
      this.homework.count({}),
      this.attachments.count({}),
      this.attendance.todaySummary(),
      this.payments.summarize(),
      this.finance.summary(),
      this.attendance.countPendingReviews(),
      this.activationCodes.statistics(),
      this.notifications.countUnread(userId),
      this.grades.count({}),
    ]);

    return {
      students: {
        total: studentStats.total,
        active: studentStats.active,
        pending: studentStats.pending,
        attendanceWarnings: studentStats.attendanceWarnings,
        averageAttendancePercentage: studentStats.averageAttendancePercentage,
      },
      content: {
        totalCollections,
        activeCollections,
        totalLessons,
        totalHomework,
        totalAttachments,
        totalGrades,
      },
      attendance: {
        today: todayAttendance,
        pendingApprovals: pendingAttendance,
        warningThreshold: env.ATTENDANCE_WARNING_THRESHOLD,
        warnings: studentStats.attendanceWarnings,
        overallPercentage: studentStats.averageAttendancePercentage,
      },
      payments: {
        pending: paymentSummary[PAYMENT_STATUS.PENDING],
        paid: paymentSummary[PAYMENT_STATUS.PAID],
        late: paymentSummary[PAYMENT_STATUS.LATE],
        outstanding: paymentSummary.outstanding,
        totalBilled: paymentSummary.totalBilled,
      },
      finance: {
        totalRevenue: financeSummary.totalRevenue,
        totalExpenses: financeSummary.totalExpenses,
        netProfit: financeSummary.netProfit,
        currentMonth: financeSummary.currentMonth,
      },
      activationCodes: activationCodeStats,
      notifications: { unread: unreadNotifications },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Compact tile set for a narrow header strip — the figures most instructors
   * glance at, without the heavier aggregations.
   */
  async quickStats() {
    const [studentStats, todayAttendance, paymentSummary] = await Promise.all([
      this.students.statusCounts(env.ATTENDANCE_WARNING_THRESHOLD),
      this.attendance.todaySummary(),
      this.payments.summarize(),
    ]);

    return {
      totalStudents: studentStats.total,
      activeStudents: studentStats.active,
      pendingStudents: studentStats.pending,
      attendanceToday: todayAttendance.attendancePercentage,
      outstandingPayments: paymentSummary.outstanding,
      attendanceWarnings: studentStats.attendanceWarnings,
    };
  }

  /** The instructor's action queue: everything currently awaiting a decision. */
  async actionItems(userId) {
    const [pendingStudents, pendingAttendance, latePayments, unreadCritical] = await Promise.all([
      this.students.count({ status: 'pending' }),
      this.attendance.countPendingReviews(),
      this.payments.count({ status: PAYMENT_STATUS.LATE }),
      this.notifications.count({
        recipient: userId,
        isRead: false,
        type: {
          $in: [NOTIFICATION_TYPES.ATTENDANCE_WARNING, NOTIFICATION_TYPES.LATE_PAYMENT],
        },
      }),
    ]);

    return {
      pendingStudentApprovals: pendingStudents,
      pendingAttendanceApprovals: pendingAttendance,
      latePayments,
      unreadCriticalNotifications: unreadCritical,
      total: pendingStudents + pendingAttendance + latePayments,
    };
  }

  /** Financial and attendance trend data for the dashboard charts. */
  async trends(months = 6) {
    const [financeSeries, lessonsByKind] = await Promise.all([
      this.finance.monthlySeries(months),
      this.lessons.countByFileKind(),
    ]);
    return { finance: financeSeries, lessonsByFileKind: lessonsByKind };
  }

  /** Recently created records across the system, for an activity feed. */
  async recentActivity(limit = 10) {
    const [students, payments, homework, lessons] = await Promise.all([
      this.students.findMany(
        {},
        { limit, sort: { createdAt: -1 }, select: 'fullName status createdAt' }
      ),
      this.payments.findMany(
        {},
        {
          limit,
          sort: { createdAt: -1 },
          select: 'amount status dueDate createdAt',
          populate: { path: 'student', select: 'fullName' },
        }
      ),
      this.homework.findMany(
        {},
        { limit, sort: { createdAt: -1 }, select: 'title dueDate createdAt' }
      ),
      this.lessons.findMany({}, { limit, sort: { createdAt: -1 }, select: 'lessonName createdAt' }),
    ]);

    return { students, payments, homework, lessons };
  }
}

module.exports = new DashboardService();
module.exports.DashboardService = DashboardService;
