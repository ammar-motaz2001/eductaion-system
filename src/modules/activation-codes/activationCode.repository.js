'use strict';

const BaseRepository = require('../../core/BaseRepository');
const ActivationCode = require('./activationCode.model');
const { ACTIVATION_CODE_STATUS } = require('../../core/constants');
const { generateActivationCode } = require('../../utils/token.util');

/** Retries on the (astronomically unlikely) event a random code already exists. */
const MAX_GENERATION_ATTEMPTS = 5;

class ActivationCodeRepository extends BaseRepository {
  constructor(model = ActivationCode) {
    super(model);
  }

  /**
   * Reserve a fresh, unused code string.
   *
   * Shared by both the instructor-issuance flow and the self-registration
   * auto-generation flow, so "what a valid code looks like" is defined once.
   *
   * @returns {Promise<string>}
   */
  async allocateUniqueCode() {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = generateActivationCode();
      // eslint-disable-next-line no-await-in-loop
      const taken = await this.exists({ code: candidate }, { includeDeleted: true });
      if (!taken) return candidate;
    }
    throw new Error('Could not allocate a unique activation code after multiple attempts');
  }

  async findByCode(code, options = {}) {
    return this.findOne({ code: String(code).toUpperCase().trim() }, options);
  }

  /**
   * Atomically claim a code for a user.
   *
   * The status/expiry conditions live in the filter so two concurrent
   * registrations racing on the same code cannot both succeed — the loser's
   * update matches nothing and receives `null`.
   *
   * @returns {Promise<object|null>} The claimed code, or `null` if unavailable.
   */
  async claim(code, userId) {
    return this.model
      .findOneAndUpdate(
        {
          code: String(code).toUpperCase().trim(),
          status: ACTIVATION_CODE_STATUS.UNUSED,
          expiresAt: { $gt: new Date() },
          deletedAt: null,
        },
        {
          $set: {
            status: ACTIVATION_CODE_STATUS.USED,
            usedAt: new Date(),
            usedBy: userId,
          },
        },
        { new: true }
      )
      .lean()
      .exec();
  }

  /** Release a claim — used to compensate when registration fails afterwards. */
  async release(id) {
    return this.updateById(id, {
      $set: { status: ACTIVATION_CODE_STATUS.UNUSED, usedAt: null, usedBy: null },
    });
  }

  async revoke(id, actorId) {
    return this.updateOne(
      { _id: id, status: ACTIVATION_CODE_STATUS.UNUSED },
      { $set: { status: ACTIVATION_CODE_STATUS.REVOKED, deletedBy: actorId } }
    );
  }

  /** Counts by status, with expired-but-unused reported separately. */
  async statistics() {
    const rows = await this.model.aggregate([
      { $match: this.matchStage({}) },
      {
        $group: {
          _id: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', ACTIVATION_CODE_STATUS.UNUSED] },
                  { $lte: ['$expiresAt', new Date()] },
                ],
              },
              'expired',
              '$status',
            ],
          },
          count: { $sum: 1 },
        },
      },
    ]);
    return rows.reduce((accumulator, row) => ({ ...accumulator, [row._id]: row.count }), {
      unused: 0,
      used: 0,
      revoked: 0,
      expired: 0,
    });
  }
}

module.exports = new ActivationCodeRepository();
module.exports.ActivationCodeRepository = ActivationCodeRepository;
