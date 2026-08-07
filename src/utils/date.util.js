'use strict';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(utc);
dayjs.extend(isoWeek);

/**
 * Date helpers used by attendance, payments and financial reporting.
 * All boundaries are computed in UTC so aggregation results are stable
 * regardless of server timezone.
 */

/** Midnight UTC on the given date — the canonical key for one attendance day. */
function startOfDay(date = new Date()) {
  return dayjs.utc(date).startOf('day').toDate();
}

function endOfDay(date = new Date()) {
  return dayjs.utc(date).endOf('day').toDate();
}

function startOfMonth(date = new Date()) {
  return dayjs.utc(date).startOf('month').toDate();
}

function endOfMonth(date = new Date()) {
  return dayjs.utc(date).endOf('month').toDate();
}

/** Inclusive `{ $gte, $lte }` range covering a whole day. */
function dayRange(date = new Date()) {
  return { $gte: startOfDay(date), $lte: endOfDay(date) };
}

/** Inclusive range covering a whole month. */
function monthRange(year, month) {
  const base = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`);
  return { $gte: base.startOf('month').toDate(), $lte: base.endOf('month').toDate() };
}

function addDays(date, days) {
  return dayjs.utc(date).add(days, 'day').toDate();
}

function addMinutes(date, minutes) {
  return dayjs.utc(date).add(minutes, 'minute').toDate();
}

/** True when `date` is strictly in the past relative to now. */
function isPast(date) {
  return dayjs.utc(date).isBefore(dayjs.utc());
}

/** Whole days between two dates (positive when `to` is later). */
function diffInDays(from, to = new Date()) {
  return dayjs.utc(to).diff(dayjs.utc(from), 'day');
}

function formatDate(date, template = 'YYYY-MM-DD') {
  if (!date) return '—';
  return dayjs.utc(date).format(template);
}

function formatDateTime(date) {
  if (!date) return '—';
  return dayjs.utc(date).format('YYYY-MM-DD HH:mm [UTC]');
}

/** Lowercase weekday name, matching the `WEEK_DAYS` constant. */
function weekdayName(date = new Date()) {
  return dayjs.utc(date).format('dddd').toLowerCase();
}

module.exports = {
  dayjs,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  dayRange,
  monthRange,
  addDays,
  addMinutes,
  isPast,
  diffInDays,
  formatDate,
  formatDateTime,
  weekdayName,
};
