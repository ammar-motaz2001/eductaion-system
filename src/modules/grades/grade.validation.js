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
const { EXAM_TYPES } = require('../../core/constants');

const examType = z.enum(Object.values(EXAM_TYPES));

const create = {
  body: z
    .object({
      student: objectId,
      collectionId: objectId,
      examType,
      title: shortText(200).optional(),
      examDate: isoDate,
      score: z.coerce.number().min(0).max(100000),
      totalScore: z.coerce.number().min(1).max(100000),
      homework: objectId.optional(),
      notes: longText(1000).optional(),
    })
    .refine((value) => value.score <= value.totalScore, {
      message: 'score cannot exceed totalScore',
      path: ['score'],
    }),
};

const createBulk = {
  body: z.object({
    collectionId: objectId,
    examType,
    examDate: isoDate,
    title: shortText(200).optional(),
    totalScore: z.coerce.number().min(1).max(100000),
    scores: z
      .array(
        z.object({
          student: objectId,
          score: z.coerce.number().min(0).max(100000),
          notes: longText(1000).optional(),
        })
      )
      .min(1, 'At least one score is required')
      .max(300),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      examType: examType.optional(),
      title: shortText(200).optional(),
      examDate: isoDate.optional(),
      score: z.coerce.number().min(0).max(100000).optional(),
      totalScore: z.coerce.number().min(1).max(100000).optional(),
      notes: longText(1000).optional(),
    })
  ),
};

// List filters accept both the bare form (`?examType=quiz`) and the operator
// form (`?examType[in]=quiz,midterm`, `?score[gte]=15`).
const list = {
  query: paginationQuery.extend({
    student: filterValue(objectId),
    collection: filterValue(objectId),
    examType: filterValue(examType),
    examDate: filterValue(),
    score: filterValue(),
  }),
};

const listForStudent = {
  params: z.object({ studentId: objectId }),
  query: list.query,
};

const upcoming = {
  query: z.object({ days: z.coerce.number().int().min(1).max(90).optional().default(7) }),
};

module.exports = { create, createBulk, update, list, listForStudent, upcoming, idParams };
