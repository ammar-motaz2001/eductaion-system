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

const upload = {
  body: z.object({
    collectionId: objectId,
    name: shortText(200).optional(),
    description: longText(2000).optional(),
    isVisibleToStudents: z.coerce.boolean().optional().default(true),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      name: shortText(200).min(1).optional(),
      description: longText(2000).optional(),
      isVisibleToStudents: z.coerce.boolean().optional(),
    })
  ),
};

const list = {
  query: paginationQuery.extend({
    collection: filterValue(objectId),
    fileKind: filterValue(z.enum(Object.values(FILE_KINDS))),
    isVisibleToStudents: filterValue(z.enum(['true', 'false'])),
  }),
};

const listForCollection = {
  params: z.object({ collectionId: objectId }),
  query: list.query,
};

module.exports = { upload, update, list, listForCollection, idParams };
