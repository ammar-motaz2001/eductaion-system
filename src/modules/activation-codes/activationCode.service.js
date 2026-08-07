'use strict';

const env = require('../../config/env');
const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { ACTIVATION_CODE_STATUS } = require('../../core/constants');
const { addDays } = require('../../utils/date.util');
const mailService = require('../../services/mail.service');

const activationCodeRepository = require('./activationCode.repository');
const collectionRepository = require('../collections/collection.repository');

/**
 * Issuance and lifecycle of student activation codes.
 */
class ActivationCodeService extends BaseService {
  constructor(
    repository = activationCodeRepository,
    collections = collectionRepository,
    mailer = mailService
  ) {
    super(repository, {
      resourceName: 'Activation code',
      searchableFields: ['code', 'intendedEmail', 'intendedName', 'notes'],
      filterableFields: [
        'status',
        'educationLevel',
        'collectionId:objectId',
        'issuedBy:objectId',
        'expiresAt:date',
        'createdAt:date',
      ],
      sortableFields: ['createdAt', 'expiresAt', 'status', 'code'],
      defaultSort: { createdAt: -1 },
      defaultPopulate: [
        { path: 'collectionId', select: 'name subject educationLevel' },
        { path: 'issuedBy', select: 'fullName email' },
        { path: 'usedBy', select: 'fullName email' },
      ],
    });
    this.collections = collections;
    this.mailer = mailer;
  }

  /** Reserve an unused code string, retrying if one already exists. */
  async #allocateCode() {
    try {
      return await this.repository.allocateUniqueCode();
    } catch {
      throw ApiError.internal('Could not allocate a unique activation code — please retry');
    }
  }

  /**
   * Issue one or more codes.
   *
   * @param {object} payload
   * @param {number} [payload.quantity=1] How many codes to generate.
   * @param {number} [payload.expiresInDays] Overrides the configured default.
   * @param {string} [payload.collectionId] Auto-enrol the redeemer here.
   * @param {string} issuedBy Instructor id.
   */
  async issue(payload, issuedBy) {
    const {
      quantity = 1,
      expiresInDays = env.ACTIVATION_CODE_EXPIRES_IN_DAYS,
      collectionId = null,
      intendedEmail = null,
      intendedName = null,
      educationLevel = null,
      notes = null,
    } = payload;

    if (collectionId) {
      const exists = await this.collections.exists({ _id: collectionId });
      if (!exists) throw ApiError.badRequest('The specified collection does not exist');
    }

    // A code bound to one email would be ambiguous if issued in bulk.
    if (intendedEmail && quantity > 1) {
      throw ApiError.badRequest('intendedEmail can only be used when issuing a single code');
    }

    const expiresAt = addDays(new Date(), expiresInDays);
    const created = [];

    for (let index = 0; index < quantity; index += 1) {
      // Sequential by necessity: each iteration must confirm its own uniqueness.
      // eslint-disable-next-line no-await-in-loop
      const code = await this.#allocateCode();
      // eslint-disable-next-line no-await-in-loop
      const record = await this.repository.create({
        code,
        expiresAt,
        issuedBy,
        collectionId,
        intendedEmail,
        intendedName,
        educationLevel,
        notes,
      });
      created.push(record);
    }

    if (intendedEmail && created.length === 1) {
      await this.mailer.sendActivationCode({
        to: intendedEmail,
        code: created[0].code,
        expiresAt,
      });
    }

    return created;
  }

  /**
   * Check a code without consuming it — lets a registration form validate early.
   * Returns only non-sensitive fields.
   */
  async verify(code) {
    const record = await this.repository.findByCode(code, {
      populate: { path: 'collectionId', select: 'name subject educationLevel' },
    });
    if (!record) throw ApiError.notFound('Activation code is not recognised');

    const expired = new Date(record.expiresAt).getTime() <= Date.now();
    const usable = record.status === ACTIVATION_CODE_STATUS.UNUSED && !expired;

    return {
      code: record.code,
      valid: usable,
      status:
        expired && record.status === ACTIVATION_CODE_STATUS.UNUSED ? 'expired' : record.status,
      expiresAt: record.expiresAt,
      educationLevel: record.educationLevel,
      collection: record.collectionId || null,
      intendedName: record.intendedName,
      reason: usable
        ? null
        : expired
          ? 'This activation code has expired'
          : `This activation code is ${record.status}`,
    };
  }

  /** Revoke an unused code so it can never be redeemed. */
  async revoke(id, actorId) {
    const record = await this.repository.findById(id);
    if (!record) throw ApiError.notFound('Activation code not found');
    if (record.status === ACTIVATION_CODE_STATUS.USED) {
      throw ApiError.conflict('A code that has already been used cannot be revoked');
    }
    const revoked = await this.repository.revoke(id, actorId);
    if (!revoked) throw ApiError.conflict('Activation code could not be revoked');
    return revoked;
  }

  /** Extend the expiry of an unused code. */
  async extend(id, days) {
    const record = await this.repository.findById(id);
    if (!record) throw ApiError.notFound('Activation code not found');
    if (record.status !== ACTIVATION_CODE_STATUS.UNUSED) {
      throw ApiError.conflict('Only unused codes can be extended');
    }
    // Extend from now when already expired, otherwise from the current expiry.
    const base = new Date(record.expiresAt).getTime() > Date.now() ? record.expiresAt : new Date();
    return this.repository.updateById(id, { $set: { expiresAt: addDays(base, days) } });
  }

  async statistics() {
    return this.repository.statistics();
  }
}

module.exports = new ActivationCodeService();
module.exports.ActivationCodeService = ActivationCodeService;
