'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Homework = require('./homework.model');

class HomeworkRepository extends BaseRepository {
  constructor(model = Homework) {
    super(model);
  }

  async countByCollection(collectionId) {
    return this.count({ collectionId });
  }

  /** Assignments due within the next `days` days, soonest first. */
  async findUpcoming(days = 7, filter = {}) {
    const now = new Date();
    const until = new Date(now.getTime() + days * 86_400_000);
    return this.findMany(
      { ...filter, dueDate: { $gte: now, $lte: until }, isPublished: true },
      { sort: { dueDate: 1 }, populate: { path: 'collectionId', select: 'name subject' } }
    );
  }

  /** Append attachments to an existing assignment. */
  async pushAttachments(id, files) {
    return this.updateById(id, { $push: { attachments: { $each: files } } });
  }

  async pullAttachment(id, key) {
    return this.updateById(id, { $pull: { attachments: { key } } });
  }
}

module.exports = new HomeworkRepository();
module.exports.HomeworkRepository = HomeworkRepository;
