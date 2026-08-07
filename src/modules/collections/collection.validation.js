'use strict';

const {
  z,
  money,
  paginationQuery,
  idParams,
  filterValue,
  shortText,
  longText,
  nonEmptyObject,
} = require('../../utils/validators');
const { EDUCATION_LEVELS, WEEK_DAYS } = require('../../core/constants');

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleSlot = z
  .object({
    day: z.enum(WEEK_DAYS),
    startTime: z.string().regex(timePattern, 'startTime must be HH:mm (24-hour)'),
    endTime: z.string().regex(timePattern, 'endTime must be HH:mm (24-hour)'),
    room: shortText(60).optional(),
  })
  .refine((slot) => slot.endTime > slot.startTime, {
    message: 'endTime must be later than startTime',
    path: ['endTime'],
  });

const create = {
  body: z.object({
    name: shortText(150).min(2, 'Name is required'),
    subject: shortText(100).min(2, 'Subject is required'),
    educationLevel: z.enum(EDUCATION_LEVELS),
    pricePerClass: money.optional().default(0),
    monthlySubscriptionPrice: money.optional().default(0),
    schedule: z.array(scheduleSlot).max(14).optional().default([]),
    description: longText(3000).optional(),
    capacity: z.coerce.number().int().min(1).max(1000).nullable().optional(),
    isActive: z.coerce.boolean().optional().default(true),
  }),
};

const update = {
  params: idParams,
  body: nonEmptyObject(
    z.object({
      name: shortText(150).min(2).optional(),
      subject: shortText(100).min(2).optional(),
      educationLevel: z.enum(EDUCATION_LEVELS).optional(),
      pricePerClass: money.optional(),
      monthlySubscriptionPrice: money.optional(),
      schedule: z.array(scheduleSlot).max(14).optional(),
      description: longText(3000).optional(),
      capacity: z.coerce.number().int().min(1).max(1000).nullable().optional(),
      isActive: z.coerce.boolean().optional(),
    })
  ),
};

const list = {
  query: paginationQuery.extend({
    subject: filterValue(shortText(100)),
    educationLevel: filterValue(z.enum(EDUCATION_LEVELS)),
    isActive: filterValue(z.enum(['true', 'false'])),
    pricePerClass: filterValue(),
    monthlySubscriptionPrice: filterValue(),
  }),
};

module.exports = { create, update, list, idParams };
