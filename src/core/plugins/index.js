'use strict';

const softDeletePlugin = require('./softDelete.plugin');
const toJSONPlugin = require('./toJSON.plugin');

/**
 * Apply the conventions every schema in this codebase shares.
 * @param {import('mongoose').Schema} schema
 * @param {object} [options]
 * @param {boolean} [options.softDelete=true]
 */
function applyBasePlugins(schema, { softDelete = true } = {}) {
  if (softDelete) schema.plugin(softDeletePlugin);
  schema.plugin(toJSONPlugin);
  return schema;
}

module.exports = { softDeletePlugin, toJSONPlugin, applyBasePlugins };
