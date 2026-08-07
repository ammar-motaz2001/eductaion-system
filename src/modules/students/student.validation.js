'use strict';

const {
  z,
  objectId,
  email,
  password,
  personName,
  phone,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
  nonEmptyObject,
} = require('../../utils/validators');
const {
  EDUCATION_LEVELS,
  STUDENT_STATUS,
  PERFORMANCE_LEVELS,
  PAYMENT_STATUS,
} = require('../../core/constants');

const addressSchema = z.object({
  line: shortText(200).optional(),
  city: shortText(80).optional(),
  governorate: shortText(80).optional(),
  country: shortText(80).optional(),
});

/** Fields shared by create and update. */
const profileFields = {
  fullName: personName,
  age: z.coerce.number().int().min(3).max(100),
  phone,
  parentPhone: phone,
  educationLevel: z.enum(EDUCATION_LEVELS),
  school: shortText(150),
  address: addressSchema,
  performance: z.enum(Object.values(PERFORMANCE_LEVELS)),
};

const create = {
  body: z.object({
    ...profileFields,
    email,
    /** Omit to have a temporary password generated and returned once. */
    password: password.optional(),
    age: profileFields.age.optional(),
    school: profileFields.school.optional(),
    address: addressSchema.optional(),
    performance: profileFields.performance.optional(),
    collections: z.array(objectId).max(30).optional().default([]),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      fullName: profileFields.fullName.optional(),
      age: profileFields.age.optional(),
      phone: phone.optional(),
      parentPhone: phone.optional(),
      educationLevel: z.enum(EDUCATION_LEVELS).optional(),
      school: profileFields.school.optional(),
      address: addressSchema.optional(),
      performance: profileFields.performance.optional(),
    })
  ),
};

const list = {
  query: paginationQuery.extend({
    status: filterValue(z.enum(Object.values(STUDENT_STATUS))),
    educationLevel: filterValue(z.enum(EDUCATION_LEVELS)),
    performance: filterValue(z.enum(Object.values(PERFORMANCE_LEVELS))),
    paymentStatus: filterValue(z.enum(Object.values(PAYMENT_STATUS))),
    /** Filter by enrolled collection id. */
    collection: filterValue(objectId),
    school: filterValue(shortText(150)),
    age: filterValue(),
    attendancePercentage: filterValue(),
  }),
};

const addNote = {
  params: idParams,
  body: z.object({ body: longText(2000).min(1, 'Note body is required') }),
};

const removeNote = {
  params: z.object({ id: objectId, noteId: objectId }),
};

const setPerformance = {
  params: idParams,
  body: z.object({ performance: z.enum(Object.values(PERFORMANCE_LEVELS)) }),
};

const setAccountActive = {
  params: idParams,
  body: z.object({ isActive: z.coerce.boolean() }),
};

const setCollections = {
  params: z.object({ studentId: objectId }),
  body: z.object({
    collections: z.array(objectId).max(30),
  }),
};

module.exports = {
  create,
  update,
  list,
  addNote,
  removeNote,
  setPerformance,
  setAccountActive,
  setCollections,
  idParams,
};
