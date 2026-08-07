'use strict';

const BaseRepository = require('../../core/BaseRepository');
const User = require('./user.model');

/**
 * Data access for authentication identities.
 *
 * Auth flows need real Mongoose documents (for `comparePassword` and the
 * password-hashing `save` hook), so several methods deliberately opt out of
 * `lean()`.
 */
class UserRepository extends BaseRepository {
  constructor(model = User) {
    super(model);
  }

  /**
   * Look up a user by email including the password hash.
   * @returns {Promise<import('mongoose').Document|null>}
   */
  async findByEmailWithPassword(email) {
    return this.model
      .findOne({ email: String(email).toLowerCase(), deletedAt: null })
      .select('+password +passwordChangedAt')
      .exec();
  }

  async findByEmail(email, { includeDeleted = false } = {}) {
    return this.findOne({ email: String(email).toLowerCase() }, { includeDeleted, lean: true });
  }

  /** Hydrated document — required when the caller intends to `save()`. */
  async findDocumentById(id, select = '') {
    const query = this.model.findOne({ _id: id, deletedAt: null });
    if (select) query.select(select);
    return query.exec();
  }

  /**
   * Append a refresh session, first pruning any that have already expired.
   *
   * The prune and the push are two round trips because MongoDB rejects `$pull`
   * and `$push` targeting the same path in a single update document.
   */
  async addRefreshSession(userId, session) {
    await this.model
      .updateOne(
        { _id: userId },
        { $pull: { refreshSessions: { expiresAt: { $lte: new Date() } } } }
      )
      .exec();

    return this.model
      .findByIdAndUpdate(userId, { $push: { refreshSessions: session } }, { new: true })
      .exec();
  }

  /** Revoke a single session (logout on this device). */
  async removeRefreshSession(userId, jti) {
    return this.model
      .findByIdAndUpdate(userId, { $pull: { refreshSessions: { jti } } }, { new: true })
      .exec();
  }

  /** Revoke every session (logout everywhere / password change). */
  async clearRefreshSessions(userId) {
    return this.model
      .findByIdAndUpdate(userId, { $set: { refreshSessions: [] } }, { new: true })
      .exec();
  }

  /** Fetch only the stored sessions for a user, for refresh-token verification. */
  async getRefreshSessions(userId) {
    const user = await this.model
      .findOne({ _id: userId, deletedAt: null })
      .select('+refreshSessions')
      .lean()
      .exec();
    return user?.refreshSessions || [];
  }

  /** Load a user by an active (unexpired) password-reset token digest. */
  async findByResetTokenHash(tokenHash) {
    return this.model
      .findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
        deletedAt: null,
      })
      .select('+passwordResetTokenHash +passwordResetExpiresAt')
      .exec();
  }

  /** Aggregate role/status counts for the dashboard in a single round trip. */
  async countByStatus(role) {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({ role }) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return rows.reduce((accumulator, row) => ({ ...accumulator, [row._id]: row.count }), {});
  }
}

module.exports = new UserRepository();
module.exports.UserRepository = UserRepository;
