'use strict';

const env = require('../../config/env');
const ApiError = require('../../core/ApiError');
const BaseRepository = require('../../core/BaseRepository');
const BaseService = require('../../core/BaseService');
const { ROLES, PAYMENT_STATUS } = require('../../core/constants');
const storageService = require('../../services/storage');
const pdfService = require('../../services/pdf.service');
const { isPast } = require('../../utils/date.util');

const Report = require('./report.model');
const studentRepository = require('../students/student.repository');
const attendanceRepository = require('../attendance/attendance.repository');
const gradeRepository = require('../grades/grade.repository');
const paymentRepository = require('../payments/payment.repository');
const homeworkRepository = require('../homework/homework.repository');
const settingService = require('../settings/setting.service');

const reportRepository = new BaseRepository(Report);

/**
 * Student report generation.
 *
 * Report content is always computed live from the source modules — a report is a
 * view, not a stored aggregate — while the `Report` collection records what was
 * generated and, for exports, where the rendered PDF lives.
 */
class ReportService extends BaseService {
  constructor(dependencies = {}) {
    super(dependencies.repository || reportRepository, {
      resourceName: 'Report',
      filterableFields: [
        'student:objectId',
        'collectionId:objectId',
        'generatedBy:objectId',
        'createdAt:date',
      ],
      sortableFields: ['createdAt'],
      defaultSort: { createdAt: -1 },
      defaultPopulate: [
        { path: 'student', select: 'fullName email' },
        { path: 'generatedBy', select: 'fullName' },
      ],
    });

    Object.assign(
      this,
      {
        students: studentRepository,
        attendance: attendanceRepository,
        grades: gradeRepository,
        payments: paymentRepository,
        homework: homeworkRepository,
        settings: settingService,
        storage: storageService,
        pdf: pdfService,
      },
      dependencies
    );
  }

  /**
   * Build the complete report payload for a student.
   *
   * @param {string} studentId
   * @param {object} [options]
   * @param {string} [options.collectionId] Restrict to one collection.
   * @param {Date} [options.from]
   * @param {Date} [options.to]
   * @param {string} [options.ownerId] Whose institution settings to use on the header.
   */
  async build(studentId, { collectionId, from, to, ownerId } = {}) {
    const student = await this.students.findById(studentId, {
      populate: { path: 'collections', select: 'name subject educationLevel' },
    });
    if (!student) throw ApiError.notFound('Student not found');

    const range = { collectionId, from, to };

    const [
      attendanceRecords,
      attendanceSummary,
      gradeRecords,
      gradeSummary,
      paymentRecords,
      paymentSummary,
      homeworkRecords,
      settings,
    ] = await Promise.all([
      this.attendance.historyForStudent(studentId, range),
      this.attendance.summarizeForStudent(studentId, collectionId),
      this.grades.historyForStudent(studentId, range),
      this.grades.summarizeForStudent(studentId, collectionId),
      this.payments.historyForStudent(studentId, range),
      this.payments.studentSummary(studentId),
      this.#homeworkFor(student, { collectionId, from, to }),
      ownerId ? this.settings.getForUser(ownerId) : null,
    ]);

    // Pair each assignment with its grade, if one was recorded.
    const gradesByHomework = new Map(
      gradeRecords.filter((grade) => grade.homework).map((grade) => [String(grade.homework), grade])
    );

    const homeworkWithResults = homeworkRecords.map((item) => {
      const grade = gradesByHomework.get(String(item._id));
      return {
        ...item,
        result: grade ? `${grade.score} / ${grade.totalScore}` : null,
        percentage: grade ? Math.round((grade.score / grade.totalScore) * 1000) / 10 : null,
      };
    });

    const gradedHomework = homeworkWithResults.filter((item) => item.percentage !== null);
    const homeworkSummary = {
      total: homeworkWithResults.length,
      graded: gradedHomework.length,
      overdue: homeworkWithResults.filter((item) => isPast(item.dueDate) && !item.result).length,
      averagePercentage: gradedHomework.length
        ? Math.round(
            (gradedHomework.reduce((sum, item) => sum + item.percentage, 0) /
              gradedHomework.length) *
              100
          ) / 100
        : 0,
    };

    return {
      generatedAt: new Date(),
      period: { from: from || null, to: to || null },
      institution: settings?.institution || null,
      student: {
        id: String(student._id),
        fullName: student.fullName,
        email: student.email,
        age: student.age,
        phone: student.phone,
        parentPhone: student.parentPhone,
        educationLevel: student.educationLevel,
        school: student.school,
        address: student.address,
        status: student.status,
        performance: student.performance,
        enrolledAt: student.enrolledAt,
        collections: student.collections || [],
      },
      attendance: {
        summary: {
          ...attendanceSummary,
          threshold: env.ATTENDANCE_WARNING_THRESHOLD,
          hasWarning:
            attendanceSummary.totalSessions > 0 &&
            attendanceSummary.attendancePercentage < env.ATTENDANCE_WARNING_THRESHOLD,
        },
        records: attendanceRecords,
      },
      grades: { summary: gradeSummary, records: gradeRecords },
      homework: { summary: homeworkSummary, records: homeworkWithResults },
      payments: {
        summary: {
          ...paymentSummary,
          status: paymentSummary.status || PAYMENT_STATUS.PENDING,
        },
        records: paymentRecords,
      },
      notes: student.notes || [],
    };
  }

  /** Assignments issued to the collections this student belongs to. */
  async #homeworkFor(student, { collectionId, from, to }) {
    const collectionIds = collectionId ? [collectionId] : student.collections || [];
    if (!collectionIds.length) return [];

    const filter = { collectionId: { $in: collectionIds }, isPublished: true };
    if (from || to) {
      filter.dueDate = {};
      if (from) filter.dueDate.$gte = from;
      if (to) filter.dueDate.$lte = to;
    }

    return this.homework.findMany(filter, {
      sort: { dueDate: 1 },
      populate: { path: 'collectionId', select: 'name subject' },
    });
  }

  /** JSON report, with the caller's access enforced. */
  async generate(user, studentId, options = {}) {
    const resolvedId = await this.#resolveStudentId(user, studentId);
    return this.build(resolvedId, { ...options, ownerId: user._id });
  }

  /** A student may only ever request their own report. */
  async #resolveStudentId(user, requestedId) {
    if (user.role === ROLES.INSTRUCTOR) return requestedId;
    const own = await this.students.findByUserId(user._id, { select: '_id' });
    if (!own) throw ApiError.notFound('No student profile is linked to this account');
    if (requestedId && String(own._id) !== String(requestedId)) {
      throw ApiError.forbidden('You may only access your own report');
    }
    return String(own._id);
  }

  /**
   * Render a report as PDF and stream it to the response.
   * Optionally archives a copy and records the generation.
   */
  async exportPdf(user, studentId, { archive = false, ...options } = {}, res) {
    const resolvedId = await this.#resolveStudentId(user, studentId);
    const report = await this.build(resolvedId, { ...options, ownerId: user._id });

    if (!archive) {
      // Stream directly — no intermediate buffer for the common case.
      this.pdf.streamStudentReport(res, report);
      // Record that the report was produced, without blocking the download.
      this.#archiveRecord(report, resolvedId, user._id, options, null).catch(() => {});
      return null;
    }

    const buffer = await this.pdf.renderStudentReportToBuffer(report);
    const stored = await this.storage.upload(
      {
        buffer,
        originalname: `report-${resolvedId}.pdf`,
        mimetype: 'application/pdf',
        size: buffer.length,
      },
      { folder: `reports/${resolvedId}`, kind: 'pdf' }
    );

    const record = await this.#archiveRecord(report, resolvedId, user._id, options, stored);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${resolvedId}.pdf"`);
    res.setHeader('X-Report-Id', String(record._id));
    res.send(buffer);
    return record;
  }

  /** Persist the generation event and a summarised snapshot. */
  async #archiveRecord(report, studentId, actorId, options, file) {
    return this.repository.create({
      student: studentId,
      collectionId: options.collectionId || null,
      periodFrom: options.from || null,
      periodTo: options.to || null,
      snapshot: {
        attendance: report.attendance.summary,
        grades: report.grades.summary,
        homework: report.homework.summary,
        payments: {
          outstanding: report.payments.summary.outstanding,
          totalBilled: report.payments.summary.totalBilled,
          status: report.payments.summary.status,
        },
        performance: report.student.performance,
      },
      file,
      generatedBy: actorId,
    });
  }

  /** Delete an archived report and its stored PDF. */
  async removeReport(id, actorId) {
    const report = await this.repository.findById(id);
    if (!report) throw ApiError.notFound('Report not found');
    await this.repository.deleteById(id, actorId);
    if (report.file) await this.storage.remove(report.file);
    return { id };
  }
}

module.exports = new ReportService();
module.exports.ReportService = ReportService;
