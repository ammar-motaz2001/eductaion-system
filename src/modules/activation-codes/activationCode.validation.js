'use strict';

const {
  z,
  objectId,
  email,
  personName,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
} = require('../../utils/validators');
const { EDUCATION_LEVELS, ACTIVATION_CODE_STATUS } = require('../../core/constants');

const issue = {
  body: z.object({
    quantity: z.coerce.number().int().min(1).max(100).optional().default(1),
    expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
    collectionId: objectId.optional(),
    intendedEmail: email.optional(),
    intendedName: personName.optional(),
    educationLevel: z.enum(EDUCATION_LEVELS).optional(),
    notes: longText(1000).optional(),
  }),
};

const list = {
  query: paginationQuery.extend({
    status: filterValue(z.enum(Object.values(ACTIVATION_CODE_STATUS))),
    educationLevel: filterValue(z.enum(EDUCATION_LEVELS)),
    collectionId: filterValue(objectId),
  }),
};

const verify = {
  params: z.object({
    code: shortText(32).transform((value) => value.toUpperCase()),
  }),
};

const extend = {
  params: idParams,
  body: z.object({
    days: z.coerce.number().int().min(1).max(365),
  }),
};

module.exports = { issue, list, verify, extend, idParams };
