'use strict';

const BaseRepository = require('../../core/BaseRepository');
const { startOfMonth, endOfMonth, monthRange } = require('../../utils/date.util');

/**
 * Shared data access for the two financial ledgers.
 *
 * Both ledgers answer the same questions (total, total this month, monthly
 * series, breakdown by category), so the aggregation logic lives once here and
 * is instantiated per model.
 */
class TransactionRepository extends BaseRepository {
  /**
   * Sum of `amount` over a filter.
   * @returns {Promise<number>}
   */
  async total(filter = {}) {
    const [row] = await this.model.aggregate([
      { $match: this.matchStage(filter) },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return Math.round((row?.total || 0) * 100) / 100;
  }

  /** Total for a specific calendar month (defaults to the current one). */
  async monthlyTotal(year, month) {
    const range =
      year && month ? monthRange(year, month) : { $gte: startOfMonth(), $lte: endOfMonth() };
    return this.total({ date: range });
  }

  /**
   * Monthly time series, oldest first.
   * @param {number} months How many months back to include.
   */
  async monthlySeries(months = 12) {
    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - (months - 1), 1);
    from.setUTCHours(0, 0, 0, 0);

    const rows = await this.model.aggregate([
      { $match: this.matchStage({ date: { $gte: from } }) },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return rows.map((row) => ({
      year: row._id.year,
      month: row._id.month,
      period: `${row._id.year}-${String(row._id.month).padStart(2, '0')}`,
      total: Math.round(row.total * 100) / 100,
      count: row.count,
    }));
  }

  /** Totals grouped by category, largest first. */
  async byCategory(filter = {}) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage(filter) },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    return rows.map((row) => ({
      category: row._id,
      total: Math.round(row.total * 100) / 100,
      count: row.count,
    }));
  }
}

module.exports = TransactionRepository;
