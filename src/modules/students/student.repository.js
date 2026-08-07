'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Student = require('./student.model');
const { STUDENT_STATUS } = require('../../core/constants');

class StudentRepository extends BaseRepository {
  constructor(model = Student) {
    super(model);
  }

  async findByUserId(userId, options = {}) {
    return this.findOne({ user: userId }, options);
  }

  /** Append an instructor note. */
  async addNote(studentId, { body, createdBy }) {
    return this.updateById(studentId, {
      $push: { notes: { body, createdBy, createdAt: new Date() } },
    });
  }

  async removeNote(studentId, noteId) {
    return this.updateById(studentId, { $pull: { notes: { _id: noteId } } });
  }

  /** Add/remove a collection id from the cached membership array. */
  async attachCollection(studentId, collectionId) {
    return this.updateById(studentId, { $addToSet: { collections: collectionId } });
  }

  async detachCollection(studentId, collectionId) {
    return this.updateById(studentId, { $pull: { collections: collectionId } });
  }

  /** Remove a deleted collection from every student's cached array. */
  async detachCollectionFromAll(collectionId) {
    return this.model
      .updateMany({ collections: collectionId }, { $pull: { collections: collectionId } })
      .exec();
  }

  /** Overwrite the cached attendance roll-up after a recount. */
  async setAttendanceStats(
    studentId,
    { totalPresent, totalAbsent, totalSessions, attendancePercentage }
  ) {
    return this.updateById(studentId, {
      $set: { totalPresent, totalAbsent, totalSessions, attendancePercentage },
    });
  }

  async setPaymentSummary(studentId, { paymentStatus, outstandingBalance }) {
    return this.updateById(studentId, { $set: { paymentStatus, outstandingBalance } });
  }

  /** Students whose attendance is under `threshold` (ignoring those with no sessions). */
  async findWithAttendanceBelow(threshold) {
    return this.findMany(
      {
        totalSessions: { $gt: 0 },
        attendancePercentage: { $lt: threshold },
        status: STUDENT_STATUS.ACTIVE,
      },
      { select: '_id user fullName attendancePercentage totalSessions' }
    );
  }

  /** `user` ids for every active student in a collection — notification fan-out. */
  async findUserIdsByCollection(collectionId) {
    const students = await this.findMany(
      { collections: collectionId, status: STUDENT_STATUS.ACTIVE },
      { select: 'user' }
    );
    return students.map((student) => student.user).filter(Boolean);
  }

  /** Dashboard counters: totals by status plus the attendance-warning count. */
  async statusCounts(warningThreshold) {
    const [rows] = await this.model.aggregate([
      { $match: this.matchStage({}) },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          total: [{ $count: 'value' }],
          warnings: [
            {
              $match: {
                totalSessions: { $gt: 0 },
                attendancePercentage: { $lt: warningThreshold },
              },
            },
            { $count: 'value' },
          ],
          averageAttendance: [
            { $match: { totalSessions: { $gt: 0 } } },
            { $group: { _id: null, value: { $avg: '$attendancePercentage' } } },
          ],
        },
      },
    ]);

    const byStatus = (rows?.byStatus || []).reduce(
      (accumulator, row) => ({ ...accumulator, [row._id]: row.count }),
      {}
    );

    return {
      total: rows?.total?.[0]?.value || 0,
      active: byStatus[STUDENT_STATUS.ACTIVE] || 0,
      pending: byStatus[STUDENT_STATUS.PENDING] || 0,
      attendanceWarnings: rows?.warnings?.[0]?.value || 0,
      averageAttendancePercentage:
        Math.round((rows?.averageAttendance?.[0]?.value || 0) * 100) / 100,
    };
  }
}

module.exports = new StudentRepository();
module.exports.StudentRepository = StudentRepository;
