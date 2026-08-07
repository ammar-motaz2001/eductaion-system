'use strict';

const BaseRepository = require('../../core/BaseRepository');
const Notification = require('./notification.model');

class NotificationRepository extends BaseRepository {
  constructor(model = Notification) {
    super(model);
  }

  /**
   * Create or refresh a notification identified by `dedupeKey`.
   *
   * Recurring rules call this so re-evaluation updates the existing alert
   * (and re-surfaces it as unread) rather than appending a duplicate.
   */
  async upsertByDedupeKey({ recipient, dedupeKey, ...payload }) {
    return this.model
      .findOneAndUpdate(
        { recipient, dedupeKey },
        {
          $set: { ...payload, recipient, dedupeKey, isRead: false, readAt: null, deletedAt: null },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .lean()
      .exec();
  }

  async markAsRead(id, recipient) {
    return this.updateOne({ _id: id, recipient }, { $set: { isRead: true, readAt: new Date() } });
  }

  async markAllAsRead(recipient) {
    const result = await this.model
      .updateMany(
        { recipient, isRead: false, deletedAt: null },
        { $set: { isRead: true, readAt: new Date() } }
      )
      .exec();
    return { modified: result.modifiedCount };
  }

  async countUnread(recipient) {
    return this.count({ recipient, isRead: false });
  }

  /** Unread totals grouped by notification type, for badge breakdowns. */
  async unreadBreakdown(recipient) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({ recipient, isRead: false }) },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((row) => ({ type: row._id, count: row.count }));
  }
}

module.exports = new NotificationRepository();
module.exports.NotificationRepository = NotificationRepository;
