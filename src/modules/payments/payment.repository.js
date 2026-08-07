'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Payment = require('./payment.model');
const { PAYMENT_STATUS } = require('../../core/constants');

class PaymentRepository extends BaseRepository {
  constructor(model = Payment) {
    super(model);
  }

  /**
   * Flip unpaid, past-due payments to `late` in one write.
   * Called on read paths so status is never stale, and never requires a cron.
   *
   * @param {Date} [asOf]
   * @returns {Promise<number>} Documents modified.
   */
  async markOverdueAsLate(asOf = new Date()) {
    const result = await this.model
      .updateMany(
        { status: PAYMENT_STATUS.PENDING, dueDate: { $lt: asOf }, deletedAt: null },
        { $set: { status: PAYMENT_STATUS.LATE } }
      )
      .exec();
    return result.modifiedCount || 0;
  }

  /** Totals and counts grouped by status. */
  async summarize(filter = {}) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage(filter) },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]);

    const base = {
      pending: { count: 0, total: 0 },
      paid: { count: 0, total: 0 },
      late: { count: 0, total: 0 },
    };

    const summary = rows.reduce(
      (accumulator, row) => ({
        ...accumulator,
        [row._id]: { count: row.count, total: Math.round(row.total * 100) / 100 },
      }),
      base
    );

    summary.outstanding = Math.round((summary.pending.total + summary.late.total) * 100) / 100;
    summary.totalBilled =
      Math.round((summary.pending.total + summary.late.total + summary.paid.total) * 100) / 100;

    return summary;
  }

  /** Outstanding balance and worst status for one student. */
  async studentSummary(student) {
    const summary = await this.summarize({ student });
    const status =
      summary.late.count > 0
        ? PAYMENT_STATUS.LATE
        : summary.pending.count > 0
          ? PAYMENT_STATUS.PENDING
          : PAYMENT_STATUS.PAID;
    return { ...summary, status };
  }

  /** Payments that just became late, for notification fan-out. */
  async findLateUnnotified(limit = 200) {
    return this.findMany(
      { status: PAYMENT_STATUS.LATE },
      { limit, sort: { dueDate: 1 }, populate: { path: 'student', select: 'fullName user email' } }
    );
  }

  async historyForStudent(student, { collectionId, from, to } = {}) {
    const filter = { student };
    if (collectionId) filter.collectionId = collectionId;
    if (from || to) {
      filter.dueDate = {};
      if (from) filter.dueDate.$gte = from;
      if (to) filter.dueDate.$lte = to;
    }
    return this.findMany(filter, {
      sort: { dueDate: 1 },
      populate: { path: 'collectionId', select: 'name subject' },
    });
  }
}

module.exports = new PaymentRepository();
module.exports.PaymentRepository = PaymentRepository;
