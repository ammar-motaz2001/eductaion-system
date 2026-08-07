'use strict';

/**
 * Normalises document serialisation across every model:
 *   • `_id` is exposed as `id`
 *   • `__v` and internal soft-delete bookkeeping are stripped
 *   • paths declared `private: true` in the schema are removed
 *
 * @param {import('mongoose').Schema} schema
 */
module.exports = function toJSONPlugin(schema) {
  /** Recursively collect paths flagged private in the schema definition. */
  function deletePrivatePaths(schemaRef, object, prefix = '') {
    Object.keys(schemaRef.paths).forEach((path) => {
      const options = schemaRef.paths[path].options || {};
      if (options.private) {
        const segments = path.split('.');
        let cursor = object;
        for (let index = 0; index < segments.length - 1; index += 1) {
          cursor = cursor?.[segments[index]];
          if (!cursor) return;
        }
        delete cursor[segments[segments.length - 1]];
      }
      void prefix;
    });
  }

  const existingTransform = schema.options.toJSON?.transform;

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(doc, ret, options) {
      ret.id = ret._id ? String(ret._id) : ret.id;
      delete ret._id;
      delete ret.__v;
      delete ret.deletedAt;
      delete ret.deletedBy;
      deletePrivatePaths(schema, ret);
      if (typeof existingTransform === 'function') {
        return existingTransform(doc, ret, options);
      }
      return ret;
    },
  });

  schema.set('toObject', { virtuals: true });
};
