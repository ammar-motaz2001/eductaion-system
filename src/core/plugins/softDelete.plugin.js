'use strict';

/**
 * Mongoose plugin adding soft-delete bookkeeping fields plus convenience
 * helpers. Query-level filtering is handled by {@link BaseRepository.scope} so
 * that callers can still opt into reading tombstoned documents.
 *
 * @param {import('mongoose').Schema} schema
 */
module.exports = function softDeletePlugin(schema) {
  schema.add({
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: require('mongoose').Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  });

  schema.virtual('isDeleted').get(function isDeleted() {
    return this.deletedAt !== null && this.deletedAt !== undefined;
  });

  /** Mark this document deleted without removing it. */
  schema.methods.softDelete = function softDelete(deletedBy = null) {
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    return this.save();
  };

  schema.methods.restore = function restore() {
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };

  /** Static helper mirroring `Model.find` but excluding tombstones. */
  schema.statics.findAlive = function findAlive(filter = {}, ...rest) {
    return this.find({ ...filter, deletedAt: null }, ...rest);
  };
};
