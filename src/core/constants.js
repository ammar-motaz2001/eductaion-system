'use strict';

/**
 * Domain-wide enumerations and shared constants.
 *
 * Values are frozen and re-used by Mongoose schemas, Zod validators and the
 * Swagger definitions so there is exactly one source of truth per enum.
 */

const ROLES = Object.freeze({
  INSTRUCTOR: 'instructor',
  STUDENT: 'student',
});

const STUDENT_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
});

const ACTIVATION_CODE_STATUS = Object.freeze({
  UNUSED: 'unused',
  USED: 'used',
  REVOKED: 'revoked',
});

const EDUCATION_LEVELS = Object.freeze([
  'primary-1',
  'primary-2',
  'primary-3',
  'primary-4',
  'primary-5',
  'primary-6',
  'preparatory-1',
  'preparatory-2',
  'preparatory-3',
  'secondary-1',
  'secondary-2',
  'secondary-3',
  'university',
  'other',
]);

const ATTENDANCE_STATUS = Object.freeze({
  PENDING: 'pending',
  PRESENT: 'present',
  ABSENT: 'absent',
});

const EXAM_TYPES = Object.freeze({
  QUIZ: 'quiz',
  ASSIGNMENT: 'assignment',
  HOMEWORK: 'homework',
  MIDTERM: 'midterm',
  FINAL: 'final',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  LATE: 'late',
});

const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  BANK_TRANSFER: 'bank-transfer',
  CARD: 'card',
  WALLET: 'wallet',
  OTHER: 'other',
});

const PERFORMANCE_LEVELS = Object.freeze({
  EXCELLENT: 'excellent',
  VERY_GOOD: 'very-good',
  GOOD: 'good',
  AVERAGE: 'average',
  WEAK: 'weak',
});

const NOTIFICATION_TYPES = Object.freeze({
  ATTENDANCE_WARNING: 'attendance-warning',
  LATE_PAYMENT: 'late-payment',
  PENDING_ATTENDANCE_APPROVAL: 'pending-attendance-approval',
  NEW_HOMEWORK: 'new-homework',
  UPCOMING_EXAM: 'upcoming-exam',
  PENDING_STUDENT_APPROVAL: 'pending-student-approval',
  GENERAL: 'general',
});

const NOTIFICATION_SEVERITY = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
});

const TRANSACTION_CATEGORIES = Object.freeze({
  REVENUE: ['tuition', 'subscription', 'books', 'exam-fees', 'donation', 'other'],
  EXPENSE: ['rent', 'salaries', 'utilities', 'equipment', 'marketing', 'maintenance', 'other'],
});

const WEEK_DAYS = Object.freeze([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

const FILE_KINDS = Object.freeze({
  PDF: 'pdf',
  IMAGE: 'image',
  DOCUMENT: 'document',
  PRESENTATION: 'presentation',
  SPREADSHEET: 'spreadsheet',
  VIDEO: 'video',
  ARCHIVE: 'archive',
  OTHER: 'other',
});

/** Default pagination envelope applied by the query builder. */
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

module.exports = {
  ROLES,
  STUDENT_STATUS,
  ACTIVATION_CODE_STATUS,
  EDUCATION_LEVELS,
  ATTENDANCE_STATUS,
  EXAM_TYPES,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  PERFORMANCE_LEVELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_SEVERITY,
  TRANSACTION_CATEGORIES,
  WEEK_DAYS,
  TOKEN_TYPES,
  FILE_KINDS,
  PAGINATION,
};
