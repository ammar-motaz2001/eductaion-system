'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Attendance = require('./attendance.model');
const { ATTENDANCE_STATUS } = require('../../core/constants');
const { dayRange } = require('../../utils/date.util');

class AttendanceRepository extends BaseRepository {
  constructor(model = Attendance) {
    super(model);
  }

  /** The single record for a student/collection/day, if any. */
  async findForDay(student, collectionId, date) {
    return this.findOne({ student, collectionId, date }, { includeDeleted: false });
  }

  /**
   * Present/absent/pending totals for a student.
   *
   * Attendance percentage is defined as present ÷ (present + absent) — pending
   * records are excluded because they have not been adjudicated yet and would
   * otherwise depress a student's figure through no fault of their own.
   *
   * @param {string} student
   * @param {string} [collectionId] Restrict to one collection.
   */
  async summarizeForStudent(student, collectionId) {
    const filter = { student };
    if (collectionId) filter.collectionId = collectionId;

    const rows = await this.model.aggregate([
      { $match: this.matchStage(filter) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const counts = rows.reduce(
      (accumulator, row) => ({ ...accumulator, [row._id]: row.count }),
      {}
    );
    const totalPresent = counts[ATTENDANCE_STATUS.PRESENT] || 0;
    const totalAbsent = counts[ATTENDANCE_STATUS.ABSENT] || 0;
    const totalPending = counts[ATTENDANCE_STATUS.PENDING] || 0;
    const totalSessions = totalPresent + totalAbsent;

    return {
      totalPresent,
      totalAbsent,
      totalPending,
      totalSessions,
      attendancePercentage:
        totalSessions === 0 ? 0 : Math.round((totalPresent / totalSessions) * 10000) / 100,
    };
  }

  /** Status counts for a collection on one day. */
  async summarizeForCollectionDay(collectionId, date) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({ collectionId, date: dayRange(date) }) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return rows.reduce((accumulator, row) => ({ ...accumulator, [row._id]: row.count }), {
      pending: 0,
      present: 0,
      absent: 0,
    });
  }

  /** Today's attendance figures across every collection — dashboard tile. */
  async todaySummary(date = new Date()) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({ date: dayRange(date) }) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = rows.reduce((accumulator, row) => ({ ...accumulator, [row._id]: row.count }), {
      pending: 0,
      present: 0,
      absent: 0,
    });
    const adjudicated = counts.present + counts.absent;
    return {
      ...counts,
      total: counts.pending + adjudicated,
      attendancePercentage:
        adjudicated === 0 ? 0 : Math.round((counts.present / adjudicated) * 10000) / 100,
    };
  }

  /** Per-student attendance rows for a report, oldest first. */
  async historyForStudent(student, { collectionId, from, to } = {}) {
    const filter = { student };
    if (collectionId) filter.collectionId = collectionId;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }
    return this.findMany(filter, {
      sort: { date: 1 },
      populate: { path: 'collectionId', select: 'name subject' },
    });
  }

  async countPendingReviews() {
    return this.count({ status: ATTENDANCE_STATUS.PENDING });
  }
}

module.exports = new AttendanceRepository();
module.exports.AttendanceRepository = AttendanceRepository;
