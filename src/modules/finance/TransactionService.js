'use strict';

const BaseService = require('../../core/BaseService');

/**
 * Shared business logic for the revenue and expense ledgers.
 *
 * Instantiated twice — once per ledger — with only the resource name and
 * category vocabulary differing.
 */
class TransactionService extends BaseService {
  /**
   * @param {TransactionRepository} repository
   * @param {{resourceName: string, categories: string[]}} options
   */
  constructor(repository, { resourceName, categories }) {
    super(repository, {
      resourceName,
      searchableFields: ['title', 'notes'],
      filterableFields: [
        'category',
        'date:date',
        'amount:number',
        'createdBy:objectId',
        'student:objectId',
        'collectionId:objectId',
        'payment:objectId',
      ],
      sortableFields: ['date', 'amount', 'title', 'category', 'createdAt'],
      defaultSort: { date: -1 },
      defaultPopulate: [
        { path: 'createdBy', select: 'fullName' },
        { path: 'student', select: 'fullName' },
        { path: 'collectionId', select: 'name subject' },
      ],
    });
    this.categories = categories;
  }

  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collectionId = normalized.collection;
      delete normalized.collection;
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  async createEntry(payload, actorId) {
    return this.repository.create({ ...payload, createdBy: actorId });
  }

  /** Total, this-month total and per-category breakdown in one call. */
  async overview() {
    const [total, thisMonth, byCategory] = await Promise.all([
      this.repository.total(),
      this.repository.monthlyTotal(),
      this.repository.byCategory(),
    ]);
    return { total, thisMonth, byCategory };
  }

  async monthlySeries(months) {
    return this.repository.monthlySeries(months);
  }

  async monthlyTotal(year, month) {
    return this.repository.monthlyTotal(year, month);
  }

  /** The valid category vocabulary for this ledger. */
  availableCategories() {
    return this.categories;
  }
}

module.exports = TransactionService;
