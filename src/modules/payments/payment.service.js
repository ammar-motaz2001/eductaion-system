'use strict';

const ApiError = require('../../core/ApiError');
const BaseService = require('../../core/BaseService');
const { PAYMENT_STATUS, PAYMENT_METHODS, ROLES } = require('../../core/constants');
const { isPast } = require('../../utils/date.util');

const paymentRepository = require('./payment.repository');
const studentRepository = require('../students/student.repository');
const collectionRepository = require('../collections/collection.repository');
const collectionStudentRepository = require('../collection-students/collectionStudent.repository');
const revenueRepository = require('../revenues/revenue.repository');
const notificationService = require('../notifications/notification.service');

/**
 * Student payments.
 *
 * Status is derived rather than trusted: `paid` requires a paid date, and an
 * unpaid item whose due date has passed becomes `late`. Read paths sweep overdue
 * rows first, so callers never observe a stale `pending` — the system stays
 * correct without depending on a scheduler being alive.
 *
 * Settling a payment also writes a matching entry to the revenue ledger, which is
 * what keeps the financial summary consistent with what students actually paid.
 */
class PaymentService extends BaseService {
  constructor({
    repository = paymentRepository,
    students = studentRepository,
    collections = collectionRepository,
    enrolments = collectionStudentRepository,
    revenues = revenueRepository,
    notifications = notificationService,
  } = {}) {
    super(repository, {
      resourceName: 'Payment',
      searchableFields: ['description', 'reference', 'notes'],
      filterableFields: [
        'student:objectId',
        'collectionId:objectId',
        'status',
        'paymentMethod',
        'dueDate:date',
        'paidDate:date',
        'amount:number',
      ],
      sortableFields: ['dueDate', 'paidDate', 'amount', 'status', 'createdAt'],
      defaultSort: { dueDate: -1 },
      defaultPopulate: [
        { path: 'student', select: 'fullName email phone parentPhone' },
        { path: 'collectionId', select: 'name subject monthlySubscriptionPrice' },
      ],
    });
    this.students = students;
    this.collections = collections;
    this.enrolments = enrolments;
    this.revenues = revenues;
    this.notifications = notifications;
  }

  toQueryOptions(query = {}, baseFilter = {}) {
    const normalized = { ...query };
    if (normalized.collection) {
      normalized.collectionId = normalized.collection;
      delete normalized.collection;
    }
    return super.toQueryOptions(normalized, baseFilter);
  }

  /** Recompute the student's cached payment status and outstanding balance. */
  async #refreshStudentSummary(studentId) {
    const summary = await this.repository.studentSummary(studentId);
    await this.students.setPaymentSummary(studentId, {
      paymentStatus: summary.status,
      outstandingBalance: summary.outstanding,
    });
    return summary;
  }

  /** Bring overdue rows up to date before any read that reports status. */
  async refreshOverdueStatuses() {
    const modified = await this.repository.markOverdueAsLate();
    if (modified > 0) {
      // Only fan out notifications when something actually changed.
      const late = await this.repository.findLateUnnotified(200);
      await Promise.all(
        late.map((payment) => this.notifications.latePayment({ payment, student: payment.student }))
      );
    }
    return modified;
  }

  /**
   * Record a new payment obligation.
   * `amount` defaults to the collection's monthly subscription price.
   */
  async record(payload, actorId) {
    const collection = await this.collections.findById(payload.collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');

    const enrolled = await this.enrolments.isEnrolled(payload.collectionId, payload.student);
    if (!enrolled) {
      throw ApiError.badRequest('This student is not enrolled in the specified collection');
    }

    const amount = payload.amount != null ? payload.amount : collection.monthlySubscriptionPrice;

    // Derive the initial status instead of trusting the client.
    let status = PAYMENT_STATUS.PENDING;
    if (payload.status === PAYMENT_STATUS.PAID || payload.paidDate) {
      status = PAYMENT_STATUS.PAID;
    } else if (isPast(payload.dueDate)) {
      status = PAYMENT_STATUS.LATE;
    }

    const payment = await this.repository.create({
      ...payload,
      amount,
      status,
      paidDate: status === PAYMENT_STATUS.PAID ? payload.paidDate || new Date() : null,
      recordedBy: actorId,
    });

    if (status === PAYMENT_STATUS.PAID) {
      await this.#recordRevenueFor(payment, actorId);
    }

    await this.#refreshStudentSummary(payload.student);
    return payment;
  }

  /** Mirror a settled payment into the revenue ledger, exactly once. */
  async #recordRevenueFor(payment, actorId) {
    if (payment.revenue) return payment.revenue;

    const revenue = await this.revenues.create({
      title: payment.description || 'Student payment',
      amount: payment.amount,
      currency: payment.currency,
      category: 'tuition',
      date: payment.paidDate || new Date(),
      notes: payment.notes,
      payment: payment._id,
      student: payment.student,
      collectionId: payment.collectionId,
      createdBy: actorId || payment.recordedBy,
    });

    await this.repository.updateById(payment._id, { $set: { revenue: revenue._id } });
    return revenue._id;
  }

  /**
   * Settle a payment.
   * Idempotent — marking an already-paid item paid again is a no-op.
   */
  async markAsPaid(id, { paidDate, paymentMethod, reference } = {}, actorId) {
    const payment = await this.repository.findById(id);
    if (!payment) throw ApiError.notFound('Payment not found');

    if (payment.status === PAYMENT_STATUS.PAID) {
      return { payment, alreadyPaid: true };
    }

    const updated = await this.repository.updateById(id, {
      $set: {
        status: PAYMENT_STATUS.PAID,
        paidDate: paidDate || new Date(),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(reference ? { reference } : {}),
      },
    });

    await this.#recordRevenueFor(updated, actorId);
    await this.#refreshStudentSummary(payment.student);

    return { payment: updated, alreadyPaid: false };
  }

  /** Force a payment to `late`, e.g. after reversing a mistaken settlement. */
  async markAsLate(id, notes) {
    const payment = await this.repository.findById(id);
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status === PAYMENT_STATUS.PAID) {
      throw ApiError.conflict(
        'A settled payment cannot be marked late — reverse it to pending first'
      );
    }

    const updated = await this.repository.updateById(id, {
      $set: { status: PAYMENT_STATUS.LATE, ...(notes !== undefined ? { notes } : {}) },
    });

    await this.#refreshStudentSummary(payment.student);
    await this.notifications.latePayment({
      payment: updated,
      student: await this.students.findById(payment.student, { select: 'fullName user' }),
    });

    return updated;
  }

  /**
   * Reverse a settlement, removing the mirrored revenue entry so the financial
   * summary does not double-count.
   */
  async reverse(id, actorId) {
    const payment = await this.repository.findById(id);
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status !== PAYMENT_STATUS.PAID) {
      throw ApiError.conflict('Only a settled payment can be reversed');
    }

    if (payment.revenue) await this.revenues.deleteById(payment.revenue, actorId);

    const updated = await this.repository.updateById(id, {
      $set: {
        status: isPast(payment.dueDate) ? PAYMENT_STATUS.LATE : PAYMENT_STATUS.PENDING,
        paidDate: null,
        revenue: null,
      },
    });

    await this.#refreshStudentSummary(payment.student);
    return updated;
  }

  async updatePayment(id, payload) {
    const payment = await this.repository.findById(id);
    if (!payment) throw ApiError.notFound('Payment not found');

    // Settlement transitions have their own endpoints so the ledger stays in sync.
    const { status: _status, paidDate: _paidDate, ...safe } = payload;

    const updated = await this.repository.updateById(id, { $set: safe });
    await this.#refreshStudentSummary(payment.student);
    return updated;
  }

  async removePayment(id, actorId) {
    const payment = await this.repository.findById(id);
    if (!payment) throw ApiError.notFound('Payment not found');

    await this.repository.deleteById(id, actorId);
    // Removing the obligation must remove the income it generated.
    if (payment.revenue) await this.revenues.deleteById(payment.revenue, actorId);
    await this.#refreshStudentSummary(payment.student);

    return { id };
  }

  /** Payment list with the overdue sweep applied first. */
  async listPayments(query, baseFilter = {}) {
    await this.refreshOverdueStatuses();
    const page = await this.list(query, baseFilter);
    const summary = await this.repository.summarize(baseFilter);
    return { ...page, meta: { ...page.meta, summary } };
  }

  /** A student's payment history; students may only read their own. */
  async listForStudent(user, studentId, query) {
    const resolvedId =
      user.role === ROLES.INSTRUCTOR
        ? studentId
        : String((await this.students.findByUserId(user._id, { select: '_id' }))?._id || '');

    if (!resolvedId) throw ApiError.notFound('Student not found');
    if (user.role !== ROLES.INSTRUCTOR && studentId && resolvedId !== String(studentId)) {
      throw ApiError.forbidden('You may only view your own payments');
    }

    return this.listPayments(query, { student: resolvedId });
  }

  /**
   * Generate the monthly subscription invoice for every active student in a
   * collection. Skips students who already have an invoice for that period.
   */
  async generateMonthlyInvoices({ collectionId, dueDate, description, amount }, actorId) {
    const collection = await this.collections.findById(collectionId);
    if (!collection) throw ApiError.notFound('Collection not found');

    const studentIds = await this.enrolments.findStudentIdsByCollection(collectionId);
    const invoiceAmount = amount != null ? amount : collection.monthlySubscriptionPrice;
    const label = description || `Monthly subscription — ${collection.name}`;

    const outcome = { created: [], skipped: [] };

    for (const studentId of studentIds) {
      // eslint-disable-next-line no-await-in-loop
      const duplicate = await this.repository.exists({
        student: studentId,
        collectionId,
        description: label,
      });
      if (duplicate) {
        outcome.skipped.push({
          student: studentId,
          reason: 'An invoice for this period already exists',
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const payment = await this.repository.create({
        student: studentId,
        collectionId,
        amount: invoiceAmount,
        dueDate,
        description: label,
        status: isPast(dueDate) ? PAYMENT_STATUS.LATE : PAYMENT_STATUS.PENDING,
        recordedBy: actorId,
      });
      outcome.created.push({ student: studentId, payment: payment._id });

      // eslint-disable-next-line no-await-in-loop
      await this.#refreshStudentSummary(studentId);
    }

    return { amount: invoiceAmount, dueDate, ...outcome };
  }

  /** Status totals across all payments, or scoped by filter. */
  async summary(filter = {}) {
    await this.refreshOverdueStatuses();
    return this.repository.summarize(filter);
  }

  /** The supported payment methods, for UI selectors. */
  // eslint-disable-next-line class-methods-use-this
  paymentMethods() {
    return Object.values(PAYMENT_METHODS);
  }
}

module.exports = new PaymentService();
module.exports.PaymentService = PaymentService;
