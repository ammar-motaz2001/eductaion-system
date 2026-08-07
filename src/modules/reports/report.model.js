'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = require('../../core/schemas/file.schema');
const { applyBasePlugins } = require('../../core/plugins');

/**
 * Archive of a generated student report.
 *
 * The report *content* is always computed live from the source modules; this
 * collection records what was generated, when, and where the rendered PDF was
 * stored, so a report handed to a parent can be reproduced byte-for-byte later.
 */
const reportSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', default: null, index: true },

    /** Reporting window; `null` means "all time". */
    periodFrom: { type: Date, default: null },
    periodTo: { type: Date, default: null },

    /** Frozen snapshot of the computed figures at generation time. */
    snapshot: { type: Schema.Types.Mixed, default: {} },

    /** Rendered PDF, present when the report was exported rather than previewed. */
    file: { type: fileSchema, default: null },

    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

applyBasePlugins(reportSchema);

reportSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
