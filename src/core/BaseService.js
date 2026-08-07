'use strict';

const ApiError = require('./ApiError');
const { buildQueryOptions } = require('./QueryOptions');

/**
 * Reusable CRUD behaviour shared by concrete services.
 *
 * Subclasses declare *what* their resource looks like (searchable fields,
 * filters, populate rules) and override only the operations that carry real
 * business logic — the mechanical parts stay here (open/closed principle).
 */
class BaseService {
  /**
   * @param {import('./BaseRepository')} repository
   * @param {object} [options]
   * @param {string} [options.resourceName='Resource'] Used in error messages.
   * @param {string[]} [options.searchableFields]
   * @param {Array<string|object>} [options.filterableFields]
   * @param {string[]} [options.sortableFields]
   * @param {object} [options.defaultSort]
   * @param {Array|string} [options.defaultPopulate]
   */
  constructor(repository, options = {}) {
    if (!repository) throw new Error('BaseService requires a repository');
    this.repository = repository;
    this.resourceName = options.resourceName || 'Resource';
    this.searchableFields = options.searchableFields || [];
    this.filterableFields = options.filterableFields || [];
    this.sortableFields = options.sortableFields || [];
    this.defaultSort = options.defaultSort || { createdAt: -1 };
    this.defaultPopulate = options.defaultPopulate;
  }

  /** Translate `req.query` into repository query options. */
  toQueryOptions(query = {}, baseFilter = {}) {
    return buildQueryOptions(query, {
      searchableFields: this.searchableFields,
      filterableFields: this.filterableFields,
      sortableFields: this.sortableFields,
      defaultSort: this.defaultSort,
      baseFilter,
    });
  }

  async create(payload) {
    return this.repository.create(payload);
  }

  /**
   * @param {object} query `req.query`
   * @param {object} [baseFilter] Additional scoping (e.g. only my records).
   */
  async list(query = {}, baseFilter = {}) {
    const options = this.toQueryOptions(query, baseFilter);
    return this.repository.paginate(options, { populate: this.defaultPopulate });
  }

  /** Fetch by id or throw a 404. */
  async getById(id, { populate, baseFilter = {} } = {}) {
    const document = await this.repository.findOne(
      { _id: id, ...baseFilter },
      { populate: populate === undefined ? this.defaultPopulate : populate }
    );
    if (!document) throw ApiError.notFound(`${this.resourceName} not found`);
    return document;
  }

  async update(id, payload, { baseFilter = {} } = {}) {
    const updated = await this.repository.updateOne(
      { _id: id, ...baseFilter },
      { $set: payload },
      { populate: this.defaultPopulate }
    );
    if (!updated) throw ApiError.notFound(`${this.resourceName} not found`);
    return updated;
  }

  /** Soft delete when supported, hard delete otherwise. */
  async remove(id, actorId, { baseFilter = {} } = {}) {
    const existing = await this.repository.findOne({ _id: id, ...baseFilter }, { select: '_id' });
    if (!existing) throw ApiError.notFound(`${this.resourceName} not found`);
    await this.repository.deleteById(id, actorId);
    return { id };
  }

  async restore(id) {
    const restored = await this.repository.restoreById(id);
    if (!restored) throw ApiError.notFound(`${this.resourceName} not found`);
    return restored;
  }
}

module.exports = BaseService;
