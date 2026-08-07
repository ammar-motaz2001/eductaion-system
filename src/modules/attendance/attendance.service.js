'use strict';

const env = require('../../config/env');
const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ATTENDANCE_STATUS, ROLES } = require('../../core/constants');
const { startOfDay, dayRange } = require('../../utils/date.util');

const attendanceRepository = require('./attendance.repository');
const studentRepository = require('../students/student.repository');
const collectionStudentRepository = require('../collection-students/collectionStudent.repository');
const collectionRepository = require('../collections/collection.repository');
const notificationService = require('../notifications/notification.service');

/**
 * Attendance recording, review workflow and derived statistics.
 *
 * Workflow: a student submits attendance for a day, producing a `pending`
 * record; the instructor then confirms `present` or marks `absent`. Instructors
 * may also record a final status directly.
 *
 * Every write that can change a student's adjudicated totals funnels through
 * {@link #refreshStudentStats}, which recomputes the cached roll-up and raises
 * the low-attendance warning. Keeping that in one place is what makes the
 * "below 50% ⇒ warn" rule impossible to bypass.
 */
class AttendanceService extends BaseService {
  constructor({
    repository = attendanceRepository,
    students = studentRepository,
    enrolments = collectionStudentRepository,
    collections = collectionRepository,
    notifications = notificationService,
  } = {}) {
    super(repository, {
      resourceName: 'Attendance record',
      searchableFields: ['notes'],
      filterableFields: [
        'student:objectId',
        'collectionId:objectId',
        'status',
        'date:date',
        'createdAt:date',
      ],
      sortableFields: ['date', 'status', 'createdAt'],
      defaultSort: { date: -1 },
      defaultPopulate: [
        { path: 'student', select: 'fullName email educationLevel' },
        { path: 'collectionId', select: 'name subject' },
      ],
    });
    this.students = students;
    this.enrolments = enrolments;
    this.collections = collections;
    this.notifications = notifications;
  }

  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collectionId = normalized.collection;
      delete normalized.collection;
    }
    // `?date=2026-07-31` should match the whole day, not the exact midnight instant.
    if (typeof normalized.date === 'string') {
      const range = dayRange(normalized.date);
      delete normalized.date;
      return super.toQueryOptions(normalized, { ...baseFilter, date: range });
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  /** The configured warning threshold as a percentage. */
  get warningThreshold() {
    return env.ATTENDANCE_WARNING_THRESHOLD;
  }

  /** Refuse attendance for a student who is not on the collection's roster. */
  async #assertEnrolled(collectionId, studentId) {
    const enrolled = await this.enrolments.isEnrolled(collectionId, studentId);
    if (!enrolled) {
      throw ApiError.badRequest('This student is not enrolled in the specified collection');
    }
  }

  /**
   * Recompute a student's cached attendance roll-up and fire the warning rule.
   *
   * @param {string} studentId
   * @returns {Promise<object>} The recomputed summary.
   */
  async #refreshStudentStats(studentId) {
    const summary = await this.repository.summarizeForStudent(studentId);
    await this.students.setAttendanceStats(studentId, summary);

    // Business rule: attendance below the threshold raises a warning notification.
    // Deduplicated per student, so re-evaluation refreshes rather than spams.
    if (summary.totalSessions > 0 && summary.attendancePercentage < this.warningThreshold) {
      const student = await this.students.findById(studentId, { select: '_id user fullName' });
      if (student) {
        await this.notifications.attendanceWarning({
          student,
          percentage: summary.attendancePercentage,
          threshold: this.warningThreshold,
        });
      }
    }

    return summary;
  }

  /**
   * Student self-service submission — creates a `pending` record awaiting review.
   */
  async submit(user, { collectionId, date, notes }) {
    const student = await this.students.findByUserId(user._id, { select: '_id fullName user' });
    if (!student) throw ApiError.notFound('No student profile is linked to this account');

    await this.#assertEnrolled(collectionId, student._id);

    const day = startOfDay(date || new Date());
    const existing = await this.repository.findForDay(student._id, collectionId, day);
    if (existing) {
      throw ApiError.conflict(
        `Attendance for this day has already been recorded (status: ${existing.status})`
      );
    }

    const record = await this.repository.create({
      student: student._id,
      collectionId,
      date: day,
      status: ATTENDANCE_STATUS.PENDING,
      submittedBy: user._id,
      submittedAt: new Date(),
      notes,
    });

    await this.notifications.pendingAttendanceApproval({ attendance: record, student });
    return record;
  }

  /**
   * Instructor records (or overwrites) a final status for one student/day.
   * Idempotent: submitting the same day again updates the existing record.
   */
  async record({ student: studentId, collectionId, date, status, notes }, actorId) {
    await this.#assertEnrolled(collectionId, studentId);

    const day = startOfDay(date || new Date());
    const record = await this.repository.upsert(
      { student: studentId, collectionId, date: day },
      {
        $set: {
          status,
          notes,
          reviewedBy: actorId,
          reviewedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        },
      }
    );

    await this.#refreshStudentStats(studentId);
    return record;
  }

  /**
   * Review a pending submission.
   * @param {'present'|'absent'} status
   */
  async review(id, status, actorId, notes) {
    const record = await this.repository.findById(id);
    if (!record) throw ApiError.notFound('Attendance record not found');
    if (record.status !== ATTENDANCE_STATUS.PENDING) {
      throw ApiError.conflict(`This record has already been reviewed (status: ${record.status})`);
    }

    const updated = await this.repository.updateById(id, {
      $set: {
        status,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    await this.#refreshStudentStats(record.student);
    return updated;
  }

  /**
   * Bulk-record a whole class for one day.
   *
   * @param {object} payload
   * @param {Array<{student: string, status: string}>} payload.records
   */
  async recordBulk({ collectionId, date, records }, actorId) {
    const collection = await this.collections.findById(collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');

    const day = startOfDay(date || new Date());
    const enrolledIds = (await this.enrolments.findStudentIdsByCollection(collectionId)).map(
      String
    );

    const outcome = { recorded: [], skipped: [] };
    const touchedStudents = new Set();

    for (const entry of records) {
      if (!enrolledIds.includes(String(entry.student))) {
        outcome.skipped.push({ student: entry.student, reason: 'Not enrolled in this collection' });
        continue;
      }
      // Sequential upserts keep the unique index from racing against itself.
      // eslint-disable-next-line no-await-in-loop
      await this.repository.upsert(
        { student: entry.student, collectionId, date: day },
        {
          $set: {
            status: entry.status,
            notes: entry.notes,
            reviewedBy: actorId,
            reviewedAt: new Date(),
            deletedAt: null,
            deletedBy: null,
          },
        }
      );
      outcome.recorded.push({ student: entry.student, status: entry.status });
      touchedStudents.add(String(entry.student));
    }

    // Recompute once per affected student rather than once per record.
    await Promise.all([...touchedStudents].map((id) => this.#refreshStudentStats(id)));

    return { date: day, ...outcome };
  }

  /** Change an already-adjudicated record. */
  async updateRecord(id, payload, actorId) {
    const record = await this.repository.findById(id);
    if (!record) throw ApiError.notFound('Attendance record not found');

    const updated = await this.repository.updateById(id, {
      $set: { ...payload, reviewedBy: actorId, reviewedAt: new Date() },
    });

    if (payload.status) await this.#refreshStudentStats(record.student);
    return updated;
  }

  async removeRecord(id, actorId) {
    const record = await this.repository.findById(id);
    if (!record) throw ApiError.notFound('Attendance record not found');
    await this.repository.deleteById(id, actorId);
    await this.#refreshStudentStats(record.student);
    return { id };
  }

  /** Records awaiting instructor review. */
  async listPending(query) {
    return this.list({ ...query, status: ATTENDANCE_STATUS.PENDING });
  }

  /** A student's attendance summary; students may only ask about themselves. */
  async summaryForStudent(user, studentId, collectionId) {
    const resolvedId =
      user.role === ROLES.INSTRUCTOR
        ? studentId
        : (await this.students.findByUserId(user._id, { select: '_id' }))?._id;

    if (!resolvedId) throw ApiError.notFound('Student not found');
    if (user.role !== ROLES.INSTRUCTOR && studentId && String(resolvedId) !== String(studentId)) {
      throw ApiError.forbidden('You may only view your own attendance');
    }

    const summary = await this.repository.summarizeForStudent(resolvedId, collectionId);
    return {
      ...summary,
      threshold: this.warningThreshold,
      hasWarning: summary.totalSessions > 0 && summary.attendancePercentage < this.warningThreshold,
    };
  }

  /** Attendance for one collection on one day, with per-status counts. */
  async collectionDay(collectionId, date) {
    const day = startOfDay(date || new Date());
    const [records, counts] = await Promise.all([
      this.repository.findMany(
        { collectionId, date: dayRange(day) },
        { populate: { path: 'student', select: 'fullName email' }, sort: { createdAt: 1 } }
      ),
      this.repository.summarizeForCollectionDay(collectionId, day),
    ]);
    return { date: day, counts, records };
  }

  async todaySummary() {
    return this.repository.todaySummary();
  }

  /**
   * Re-evaluate every active student's cached statistics.
   * Useful after a data import or a manual database edit.
   */
  async recalculateAll() {
    const students = await this.students.findMany({}, { select: '_id' });
    let updated = 0;
    for (const student of students) {
      // eslint-disable-next-line no-await-in-loop
      await this.#refreshStudentStats(student._id);
      updated += 1;
    }
    return { studentsProcessed: updated };
  }

  /** A student's own attendance list. */
  async listForStudentUser(user, query) {
    const student = await this.students.findByUserId(user._id, { select: '_id' });
    if (!student) throw ApiError.notFound('No student profile is linked to this account');
    return this.list(query, { student: student._id });
  }
}

module.exports = new AttendanceService();
module.exports.AttendanceService = AttendanceService;
