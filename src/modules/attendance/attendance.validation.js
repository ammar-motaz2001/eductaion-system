'use strict';

const {
  z,
  objectId,
  isoDate,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
} = require('../../utils/validators');
const { ATTENDANCE_STATUS } = require('../../core/constants');

/** Only adjudicated statuses may be assigned by an instructor. */
const finalStatus = z.enum([ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT]);

/** Student self-submission. */
const submit = {
  body: z.object({
    collectionId: objectId,
    date: isoDate.optional(),
    notes: shortText(500).optional(),
  }),
};

/** Instructor records a final status directly. */
const record = {
  body: z.object({
    student: objectId,
    collectionId: objectId,
    date: isoDate.optional(),
    status: finalStatus,
    notes: shortText(500).optional(),
  }),
};

const recordBulk = {
  body: z.object({
    collectionId: objectId,
    date: isoDate.optional(),
    records: z
      .array(
        z.object({
          student: objectId,
          status: finalStatus,
          notes: shortText(500).optional(),
        })
      )
      .min(1, 'At least one record is required')
      .max(300),
  }),
};

const review = {
  params: idParams,
  body: z.object({
    status: finalStatus,
    notes: shortText(500).optional(),
  }),
};

const update = {
  params: idParams,
  body: z
    .object({
      status: z.enum(Object.values(ATTENDANCE_STATUS)).optional(),
      notes: shortText(500).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field must be provided',
    }),
};

const list = {
  query: paginationQuery.extend({
    student: filterValue(objectId),
    collection: filterValue(objectId),
    status: filterValue(z.enum(Object.values(ATTENDANCE_STATUS))),
    date: filterValue(),
  }),
};

const summary = {
  query: z.object({
    student: objectId.optional(),
    collection: objectId.optional(),
  }),
};

const collectionDay = {
  params: z.object({ collectionId: objectId }),
  query: z.object({ date: isoDate.optional() }),
};

module.exports = {
  submit,
  record,
  recordBulk,
  review,
  update,
  list,
  summary,
  collectionDay,
  idParams,
};
