'use strict';

const { z, objectId, paginationQuery, filterValue, shortText } = require('../../utils/validators');
const { STUDENT_STATUS, PERFORMANCE_LEVELS, PAYMENT_STATUS } = require('../../core/constants');

/** Nested-route path parameters. */
const collectionParams = z.object({ collectionId: objectId });
const enrolmentParams = z.object({ collectionId: objectId, studentId: objectId });

/** Accept either a single `student` or a batch of `students`. */
const addStudent = {
  params: collectionParams,
  body: z
    .object({
      student: objectId.optional(),
      students: z.array(objectId).min(1).max(200).optional(),
      notes: shortText(500).optional(),
    })
    .refine((value) => Boolean(value.student) !== Boolean(value.students?.length), {
      message: 'Provide either "student" (single) or "students" (array), but not both',
    }),
};

const listStudents = {
  params: collectionParams,
  query: paginationQuery.extend({
    status: filterValue(z.enum(Object.values(STUDENT_STATUS))),
    performance: filterValue(z.enum(Object.values(PERFORMANCE_LEVELS))),
    paymentStatus: filterValue(z.enum(Object.values(PAYMENT_STATUS))),
    attendancePercentage: filterValue(),
  }),
};

const setActive = {
  params: enrolmentParams,
  body: z.object({ isActive: z.coerce.boolean() }),
};

module.exports = {
  collectionParams,
  enrolmentParams,
  addStudent,
  listStudents,
  setActive,
  removeStudent: { params: enrolmentParams },
};
