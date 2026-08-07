'use strict';

const {
  z,
  objectId,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
  nonEmptyObject,
} = require('../../utils/validators');
const { FILE_KINDS } = require('../../core/constants');

/**
 * Multipart bodies arrive as strings, so numbers and booleans are coerced here
 * rather than being declared as native types.
 */
const upload = {
  body: z.object({
    collectionId: objectId,
    lessonName: shortText(200).min(2, 'Lesson name is required'),
    className: shortText(150).optional(),
    description: longText(3000).optional(),
    order: z.coerce.number().int().min(0).max(9999).optional().default(0),
    isPublished: z.coerce.boolean().optional().default(true),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      lessonName: shortText(200).min(2).optional(),
      className: shortText(150).optional(),
      description: longText(3000).optional(),
      order: z.coerce.number().int().min(0).max(9999).optional(),
      isPublished: z.coerce.boolean().optional(),
    })
  ),
};

const list = {
  query: paginationQuery.extend({
    collection: filterValue(objectId),
    className: filterValue(shortText(150)),
    fileKind: filterValue(z.enum(Object.values(FILE_KINDS))),
    isPublished: filterValue(z.enum(['true', 'false'])),
  }),
};

const listForCollection = {
  params: z.object({ collectionId: objectId }),
  query: list.query,
};

module.exports = { upload, update, list, listForCollection, idParams };
