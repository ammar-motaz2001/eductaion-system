'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Lesson = require('./lesson.model');

class LessonRepository extends BaseRepository {
  constructor(model = Lesson) {
    super(model);
  }

  /** Fire-and-forget download counter. */
  async incrementDownloads(id) {
    return this.model.updateOne({ _id: id }, { $inc: { downloadCount: 1 } }).exec();
  }

  async countByCollection(collectionId) {
    return this.count({ collectionId });
  }

  /** Lesson totals grouped by file kind — dashboard breakdown. */
  async countByFileKind() {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({}) },
      { $group: { _id: '$file.kind', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((row) => ({ kind: row._id, count: row.count }));
  }
}

module.exports = new LessonRepository();
module.exports.LessonRepository = LessonRepository;
