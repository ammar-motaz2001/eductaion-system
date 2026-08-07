'use strict';

/**
 * Translates HTTP query strings into safe Mongoose query options.
 *
 * Supported query parameters:
 *   ?page=2&limit=25                     pagination
 *   ?sort=-createdAt,fullName            multi-field sorting ("-" = descending)
 *   ?search=ali                          case-insensitive regex over whitelisted fields
 *   ?status=active&level=secondary-1      equality filters (whitelisted only)
 *   ?score[gte]=50&score[lt]=90           range operators
 *   ?examType[in]=quiz,midterm            set membership
 *   ?fields=fullName,age                  projection
 *
 * Only whitelisted fields are ever promoted into the database query, which keeps
 * arbitrary user input from reaching the query engine as operators.
 */

const mongoose = require('mongoose');

const { PAGINATION } = require('./constants');

/** Mongo comparison operators clients may use, mapped to their `$`-prefixed form. */
const ALLOWED_OPERATORS = Object.freeze([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'regex',
  'exists',
]);

/** Query params that are never treated as filters. */
const RESERVED_KEYS = Object.freeze([
  'page',
  'limit',
  'sort',
  'search',
  'fields',
  'populate',
  'includeDeleted',
]);

/** Escape user input before embedding it into a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cast a raw string into the type declared for that filter, if any. */
function castValue(value, type) {
  if (value === undefined || value === null || value === '') return value;

  switch (type) {
    case 'number': {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    case 'boolean':
      return ['true', '1', 'yes'].includes(String(value).toLowerCase());
    case 'date': {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    case 'objectId':
      return mongoose.Types.ObjectId.isValid(value)
        ? new mongoose.Types.ObjectId(value)
        : undefined;
    default:
      return value;
  }
}

/**
 * Normalise a filter whitelist entry into `{ path, type }`.
 * Accepts `'status'`, `'status:objectId'` or `{ status: { path, type } }` style input.
 */
function normalizeFilterSpec(spec) {
  if (typeof spec === 'string') {
    const [path, type] = spec.split(':');
    return { path, type: type || 'string' };
  }
  return { path: spec.path, type: spec.type || 'string' };
}

/**
 * @typedef {object} QueryOptionsResult
 * @property {object} filter Mongo filter document.
 * @property {object} sort Mongo sort document.
 * @property {number} page 1-based page number.
 * @property {number} limit Page size.
 * @property {number} skip Documents to skip.
 * @property {string|undefined} select Space-separated projection.
 * @property {boolean} includeDeleted Whether soft-deleted docs were requested.
 */

/**
 * Build query options from a request query object.
 *
 * @param {object} query `req.query`
 * @param {object} [config]
 * @param {string[]} [config.searchableFields] Fields covered by `?search=`.
 * @param {Array<string|object>} [config.filterableFields] Whitelisted filters, e.g. `['status', 'score:number']`.
 * @param {string[]} [config.sortableFields] Whitelisted sort fields; empty = allow any filterable/searchable field.
 * @param {object} [config.defaultSort={ createdAt: -1 }]
 * @param {string[]} [config.selectableFields] Whitelisted projection fields.
 * @param {object} [config.baseFilter={}] Filter merged in unconditionally (e.g. tenant scoping).
 * @returns {QueryOptionsResult}
 */
function buildQueryOptions(query = {}, config = {}) {
  const {
    searchableFields = [],
    filterableFields = [],
    sortableFields = [],
    defaultSort = { createdAt: -1 },
    selectableFields = [],
    baseFilter = {},
  } = config;

  const specs = filterableFields.map(normalizeFilterSpec);
  const specByAlias = new Map(specs.map((spec) => [spec.path, spec]));

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, Number.parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE);
  const requestedLimit = Number.parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requestedLimit), PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * limit;

  // ── Filters ───────────────────────────────────────────────────────────────
  const filter = { ...baseFilter };
  const andConditions = [];

  for (const [key, rawValue] of Object.entries(query)) {
    if (RESERVED_KEYS.includes(key)) continue;
    const spec = specByAlias.get(key);
    if (!spec) continue; // silently ignore unknown filters

    if (rawValue !== null && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      // Operator form: ?score[gte]=50
      const conditions = {};
      for (const [operator, operand] of Object.entries(rawValue)) {
        if (!ALLOWED_OPERATORS.includes(operator)) continue;

        if (operator === 'in' || operator === 'nin') {
          const list = String(operand)
            .split(',')
            .map((item) => castValue(item.trim(), spec.type))
            .filter((item) => item !== undefined && item !== '');
          if (list.length) conditions[`$${operator}`] = list;
        } else if (operator === 'regex') {
          conditions.$regex = escapeRegex(operand);
          conditions.$options = 'i';
        } else if (operator === 'exists') {
          conditions.$exists = castValue(operand, 'boolean');
        } else {
          const casted = castValue(operand, spec.type);
          if (casted !== undefined) conditions[`$${operator}`] = casted;
        }
      }
      if (Object.keys(conditions).length) filter[spec.path] = conditions;
      continue;
    }

    // Equality form, with comma-separated values treated as $in.
    const values = String(rawValue)
      .split(',')
      .map((item) => castValue(item.trim(), spec.type))
      .filter((item) => item !== undefined && item !== '');

    if (!values.length) continue;
    filter[spec.path] = values.length === 1 ? values[0] : { $in: values };
  }

  // ── Search ────────────────────────────────────────────────────────────────
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search && searchableFields.length) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    andConditions.push({
      $or: searchableFields.map((field) => ({ [field]: pattern })),
    });
  }

  if (andConditions.length) {
    filter.$and = [...(filter.$and || []), ...andConditions];
  }

  // ── Sorting ───────────────────────────────────────────────────────────────
  let sort = defaultSort;
  if (typeof query.sort === 'string' && query.sort.trim()) {
    const allowed = sortableFields.length
      ? sortableFields
      : [
          ...new Set([
            ...specs.map((spec) => spec.path),
            ...searchableFields,
            'createdAt',
            'updatedAt',
          ]),
        ];

    const parsed = {};
    for (const token of query.sort.split(',')) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      const descending = trimmed.startsWith('-');
      const field = descending ? trimmed.slice(1) : trimmed;
      if (!allowed.includes(field)) continue;
      parsed[field] = descending ? -1 : 1;
    }
    if (Object.keys(parsed).length) sort = parsed;
  }

  // ── Projection ────────────────────────────────────────────────────────────
  let select;
  if (typeof query.fields === 'string' && query.fields.trim()) {
    const requested = query.fields
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field && (!selectableFields.length || selectableFields.includes(field)));
    if (requested.length) select = requested.join(' ');
  }

  return {
    filter,
    sort,
    page,
    limit,
    skip,
    select,
    search,
    includeDeleted: ['true', '1'].includes(String(query.includeDeleted).toLowerCase()),
  };
}

/**
 * Build the pagination metadata block returned alongside list payloads.
 * @param {{page: number, limit: number}} options
 * @param {number} total
 */
function buildPaginationMeta({ page, limit }, total) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    pagination: {
      total,
      count: undefined, // filled in by the repository
      page,
      limit,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

module.exports = { buildQueryOptions, buildPaginationMeta, escapeRegex, ALLOWED_OPERATORS };
