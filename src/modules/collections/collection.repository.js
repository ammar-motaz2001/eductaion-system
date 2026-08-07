'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Collection = require('./collection.model');

class CollectionRepository extends BaseRepository {
  constructor(model = Collection) {
    super(model);
  }

  /** Adjust the denormalised enrolment counter, clamped at zero. */
  async adjustStudentsCount(collectionId, delta) {
    const updated = await this.model
      .findByIdAndUpdate(collectionId, { $inc: { studentsCount: delta } }, { new: true })
      .lean()
      .exec();
    if (updated && updated.studentsCount < 0) {
      return this.updateById(collectionId, { $set: { studentsCount: 0 } });
    }
    return updated;
  }

  /** Recompute the counter from the authoritative enrolment records. */
  async syncStudentsCount(collectionId, actualCount) {
    return this.updateById(collectionId, { $set: { studentsCount: actualCount } });
  }

  /** Distinct subjects currently taught — used to populate filter dropdowns. */
  async distinctSubjects() {
    return this.distinct('subject', {});
  }

  /** Collections that have a session on the given weekday. */
  async findScheduledOn(weekday) {
    return this.findMany({ 'schedule.day': weekday, isActive: true });
  }
}

module.exports = new CollectionRepository();
module.exports.CollectionRepository = CollectionRepository;
