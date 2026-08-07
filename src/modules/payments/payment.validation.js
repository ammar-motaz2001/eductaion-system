'use strict';

const {
  z,
  objectId,
  isoDate,
  money,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
  nonEmptyObject,
} = require('../../utils/validators');
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('../../core/constants');

const paymentMethod = z.enum(Object.values(PAYMENT_METHODS));

const record = {
  body: z.object({
    student: objectId,
    collectionId: objectId,
    /** Defaults to the collection's monthly subscription price. */
    amount: money.optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    dueDate: isoDate,
    paidDate: isoDate.optional(),
    status: z.enum(Object.values(PAYMENT_STATUS)).optional(),
    paymentMethod: paymentMethod.optional(),
    description: shortText(300).optional(),
    reference: shortText(120).optional(),
    notes: longText(1000).optional(),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      amount: money.optional(),
      currency: z.string().trim().length(3).toUpperCase().optional(),
      dueDate: isoDate.optional(),
      paymentMethod: paymentMethod.optional(),
      description: shortText(300).optional(),
      reference: shortText(120).optional(),
      notes: longText(1000).optional(),
    })
  ),
};

const markAsPaid = {
  params: idParams,
  body: z
    .object({
      paidDate: isoDate.optional(),
      paymentMethod: paymentMethod.optional(),
      reference: shortText(120).optional(),
    })
    .default({}),
};

const markAsLate = {
  params: idParams,
  body: z.object({ notes: longText(1000).optional() }).default({}),
};

const list = {
  query: paginationQuery.extend({
    student: filterValue(objectId),
    collection: filterValue(objectId),
    status: filterValue(z.enum(Object.values(PAYMENT_STATUS))),
    paymentMethod: filterValue(paymentMethod),
    dueDate: filterValue(),
    paidDate: filterValue(),
    amount: filterValue(),
  }),
};

const listForStudent = {
  params: z.object({ studentId: objectId }),
  query: list.query,
};

const generateInvoices = {
  body: z.object({
    collectionId: objectId,
    dueDate: isoDate,
    amount: money.optional(),
    description: shortText(300).optional(),
  }),
};

module.exports = {
  record,
  update,
  markAsPaid,
  markAsLate,
  list,
  listForStudent,
  generateInvoices,
  idParams,
};
