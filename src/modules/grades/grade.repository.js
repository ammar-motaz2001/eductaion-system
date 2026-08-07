'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Grade = require('./grade.model');

class GradeRepository extends BaseRepository {
  constructor(model = Grade) {
    super(model);
  }

  /**
   * Grade summary for a student: overall average plus a per-exam-type breakdown.
   *
   * The average is score-weighted (total scored ÷ total possible) rather than a
   * mean of percentages, so a 50-mark final counts more than a 5-mark quiz.
   */
  async summarizeForStudent(student, collectionId) {
    const filter = { student };
    if (collectionId) filter.collectionId = collectionId;

    const [result] = await this.model.aggregate([
      { $match: this.matchStage(filter) },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                totalScored: { $sum: '$score' },
                totalPossible: { $sum: '$totalScore' },
                examCount: { $sum: 1 },
                bestPercentage: { $max: { $divide: ['$score', '$totalScore'] } },
                worstPercentage: { $min: { $divide: ['$score', '$totalScore'] } },
              },
            },
          ],
          byExamType: [
            {
              $group: {
                _id: '$examType',
                count: { $sum: 1 },
                totalScored: { $sum: '$score' },
                totalPossible: { $sum: '$totalScore' },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const overall = result?.overall?.[0];
    const toPercentage = (scored, possible) =>
      possible > 0 ? Math.round((scored / possible) * 10000) / 100 : 0;

    return {
      examCount: overall?.examCount || 0,
      totalScored: overall?.totalScored || 0,
      totalPossible: overall?.totalPossible || 0,
      averagePercentage: toPercentage(overall?.totalScored || 0, overall?.totalPossible || 0),
      bestPercentage: overall ? Math.round((overall.bestPercentage || 0) * 10000) / 100 : 0,
      worstPercentage: overall ? Math.round((overall.worstPercentage || 0) * 10000) / 100 : 0,
      byExamType: (result?.byExamType || []).map((row) => ({
        examType: row._id,
        count: row.count,
        averagePercentage: toPercentage(row.totalScored, row.totalPossible),
      })),
    };
  }

  /** Class-wide averages for a collection, per exam type. */
  async summarizeForCollection(collectionId) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({ collectionId }) },
      {
        $group: {
          _id: '$examType',
          count: { $sum: 1 },
          totalScored: { $sum: '$score' },
          totalPossible: { $sum: '$totalScore' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((row) => ({
      examType: row._id,
      count: row.count,
      averagePercentage:
        row.totalPossible > 0 ? Math.round((row.totalScored / row.totalPossible) * 10000) / 100 : 0,
    }));
  }

  /** Chronological grade history for reports. */
  async historyForStudent(student, { collectionId, from, to } = {}) {
    const filter = { student };
    if (collectionId) filter.collectionId = collectionId;
    if (from || to) {
      filter.examDate = {};
      if (from) filter.examDate.$gte = from;
      if (to) filter.examDate.$lte = to;
    }
    return this.findMany(filter, {
      sort: { examDate: 1 },
      populate: { path: 'collectionId', select: 'name subject' },
    });
  }

  /** Exams scheduled in the near future — feeds the upcoming-exam notification. */
  async findUpcomingExams(days = 7) {
    const now = new Date();
    const until = new Date(now.getTime() + days * 86_400_000);
    return this.findMany(
      { examDate: { $gte: now, $lte: until } },
      { sort: { examDate: 1 }, populate: { path: 'collectionId', select: 'name subject' } }
    );
  }
}

module.exports = new GradeRepository();
module.exports.GradeRepository = GradeRepository;
