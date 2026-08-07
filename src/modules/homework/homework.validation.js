'use strict';

const {
  z,
  objectId,
  isoDate,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
  nonEmptyObject,
} = require('../../utils/validators');

const create = {
  body: z.object({
    collectionId: objectId,
    title: shortText(200).min(2, 'Title is required'),
    description: longText(5000).optional(),
    dueDate: isoDate,
    totalScore: z.coerce.number().min(0).max(10000).nullable().optional(),
    isPublished: z.coerce.boolean().optional().default(true),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      title: shortText(200).min(2).optional(),
      description: longText(5000).optional(),
      dueDate: isoDate.optional(),
      totalScore: z.coerce.number().min(0).max(10000).nullable().optional(),
      isPublished: z.coerce.boolean().optional(),
    })
  ),
};

const list = {
  query: paginationQuery.extend({
    collection: filterValue(objectId),
    isPublished: filterValue(z.enum(['true', 'false'])),
    /** Range filters, e.g. `?dueDate[gte]=2026-01-01`. */
    dueDate: filterValue(),
  }),
};

const listForCollection = {
  params: z.object({ collectionId: objectId }),
  query: list.query,
};

const removeAttachment = {
  params: idParams,
  body: z.object({ key: z.string().trim().min(1, 'Attachment key is required') }),
};

const upcoming = {
  query: z.object({ days: z.coerce.number().int().min(1).max(90).optional().default(7) }),
};

module.exports = { create, update, list, listForCollection, removeAttachment, upcoming, idParams };
