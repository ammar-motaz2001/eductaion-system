'use strict';

const mongoose = require('mongoose');

const { buildPaginationMeta } = require('./QueryOptions');

/**
 * Generic data-access object wrapping a Mongoose model.
 *
 * The service layer depends on this abstraction rather than on Mongoose
 * directly (dependency inversion): swapping the persistence engine means
 * re-implementing this interface, not rewriting business logic.
 *
 * Soft-delete aware — models carrying a `deletedAt` path are automatically
 * filtered unless `includeDeleted` is requested.
 */
class BaseRepository {
  /**
   * @param {import('mongoose').Model} model
   */
  constructor(model) {
    if (!model) throw new Error('BaseRepository requires a Mongoose model');
    this.model = model;
    this.supportsSoftDelete = Boolean(model.schema.path('deletedAt'));
  }

  /** Merge the soft-delete guard into a filter unless deleted docs were requested. */
  scope(filter = {}, { includeDeleted = false } = {}) {
    if (!this.supportsSoftDelete || includeDeleted) return { ...filter };
    return { ...filter, deletedAt: null };
  }

  /**
   * @param {object} payload
   * @param {object} [options] Mongoose options (e.g. `{ session }`).
   */
  async create(payload, options = {}) {
    const [document] = await this.model.create([payload], options);
    return document;
  }

  /** Bulk insert. */
  async createMany(payloads, options = {}) {
    return this.model.create(payloads, options);
  }

  /**
   * @param {object} filter
   * @param {object} [options]
   * @param {string} [options.select]
   * @param {Array|string} [options.populate]
   * @param {boolean} [options.lean=true]
   * @param {boolean} [options.includeDeleted]
   */
  async findOne(filter = {}, options = {}) {
    const { select, populate, lean = true, includeDeleted, session, sort } = options;
    let query = this.model.findOne(this.scope(filter, { includeDeleted }));
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (sort) query = query.sort(sort);
    if (session) query = query.session(session);
    if (lean) query = query.lean();
    return query.exec();
  }

  /** Find by primary key. */
  async findById(id, options = {}) {
    return this.findOne({ _id: id }, options);
  }

  /** Unpaginated list — prefer {@link paginate} for user-facing endpoints. */
  async findMany(filter = {}, options = {}) {
    const {
      select,
      populate,
      sort = { createdAt: -1 },
      limit,
      skip,
      lean = true,
      includeDeleted,
    } = options;
    let query = this.model.find(this.scope(filter, { includeDeleted })).sort(sort);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (typeof skip === 'number') query = query.skip(skip);
    if (typeof limit === 'number') query = query.limit(limit);
    if (lean) query = query.lean();
    return query.exec();
  }

  /**
   * Paginated list returning `{ items, meta }` ready for `ApiResponse.paginated`.
   * @param {import('./QueryOptions').QueryOptionsResult} queryOptions
   * @param {object} [options]
   */
  async paginate(queryOptions, options = {}) {
    const { filter, sort, page, limit, skip, select, includeDeleted } = queryOptions;
    const scoped = this.scope(filter, { includeDeleted });
    const projection = options.select || select;

    let listQuery = this.model.find(scoped).sort(sort).skip(skip).limit(limit);
    if (projection) listQuery = listQuery.select(projection);
    if (options.populate) listQuery = listQuery.populate(options.populate);
    if (options.lean !== false) listQuery = listQuery.lean();

    const [items, total] = await Promise.all([
      listQuery.exec(),
      this.model.countDocuments(scoped).exec(),
    ]);

    const meta = buildPaginationMeta({ page, limit }, total);
    meta.pagination.count = items.length;
    return { items, meta };
  }

  /** Update the first matching document and return the updated version. */
  async updateOne(filter, update, options = {}) {
    const { populate, includeDeleted, session, lean = true } = options;
    let query = this.model.findOneAndUpdate(this.scope(filter, { includeDeleted }), update, {
      new: true,
      runValidators: true,
      context: 'query',
      session,
    });
    if (populate) query = query.populate(populate);
    if (lean) query = query.lean();
    return query.exec();
  }

  async updateById(id, update, options = {}) {
    return this.updateOne({ _id: id }, update, options);
  }

  /** Update many documents; returns the raw write result. */
  async updateMany(filter, update, options = {}) {
    return this.model
      .updateMany(this.scope(filter, options), update, { runValidators: true, ...options })
      .exec();
  }

  /**
   * Insert-or-update in one round trip.
   */
  async upsert(filter, update, options = {}) {
    return this.model
      .findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
        ...options,
      })
      .lean()
      .exec();
  }

  /** Permanently remove a document. */
  async hardDeleteById(id, options = {}) {
    return this.model.findByIdAndDelete(id, options).lean().exec();
  }

  async hardDeleteMany(filter, options = {}) {
    return this.model.deleteMany(filter, options).exec();
  }

  /**
   * Soft delete when the schema supports it, otherwise fall back to a hard delete.
   * @param {string} id
   * @param {string} [deletedBy] User id recorded as the actor.
   */
  async deleteById(id, deletedBy, options = {}) {
    if (!this.supportsSoftDelete) return this.hardDeleteById(id, options);
    return this.updateById(
      id,
      { $set: { deletedAt: new Date(), deletedBy: deletedBy || null } },
      options
    );
  }

  /** Restore a soft-deleted document. */
  async restoreById(id, options = {}) {
    if (!this.supportsSoftDelete) return null;
    return this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: { deletedAt: null, deletedBy: null } },
        { new: true, ...options }
      )
      .lean()
      .exec();
  }

  async count(filter = {}, options = {}) {
    return this.model.countDocuments(this.scope(filter, options)).exec();
  }

  async exists(filter = {}, options = {}) {
    const found = await this.model.exists(this.scope(filter, options));
    return Boolean(found);
  }

  /**
   * Cast a value destined for an ObjectId path.
   * Handles bare values, arrays and operator documents (`{ $in: [...] }`).
   */
  static castObjectId(value) {
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (Array.isArray(value)) return value.map((item) => BaseRepository.castObjectId(item));
    if (typeof value === 'string') {
      return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([operator, operand]) => [
          operator,
          BaseRepository.castObjectId(operand),
        ])
      );
    }
    return value;
  }

  /**
   * Prepare a filter for use inside an aggregation `$match`.
   *
   * `find()` casts query values against the schema automatically; the aggregation
   * pipeline does **not**. A string id passed straight into `$match` therefore
   * matches nothing and silently returns zeroed statistics — so every pipeline in
   * this codebase runs its match document through here first.
   *
   * @param {object} filter
   * @param {{includeDeleted?: boolean}} [options]
   */
  matchStage(filter = {}, { includeDeleted = false } = {}) {
    const scoped = this.scope(filter, { includeDeleted });

    return Object.fromEntries(
      Object.entries(scoped).map(([key, value]) => {
        const path = this.model.schema.path(key);
        return BaseRepository.isObjectIdPath(path)
          ? [key, BaseRepository.castObjectId(value)]
          : [key, value];
      })
    );
  }

  /**
   * Whether a schema path stores ObjectIds.
   *
   * Checked by constructor rather than by `instance` string: Mongoose has
   * reported that value as both `ObjectID` and `ObjectId` across versions, and a
   * silent mismatch here would reduce every statistic to zero.
   */
  static isObjectIdPath(path) {
    if (!path) return false;
    if (path instanceof mongoose.Schema.Types.ObjectId) return true;
    // Arrays of ObjectIds (e.g. `Student.collections`).
    return path.caster instanceof mongoose.Schema.Types.ObjectId;
  }

  /** Escape hatch for reporting/statistics pipelines. */
  async aggregate(pipeline, options = {}) {
    return this.model.aggregate(pipeline).option(options).exec();
  }

  /** Distinct values for a path, respecting the soft-delete scope. */
  async distinct(field, filter = {}, options = {}) {
    return this.model.distinct(field, this.scope(filter, options)).exec();
  }
}

module.exports = BaseRepository;
