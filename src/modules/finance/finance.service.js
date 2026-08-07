'use strict';

const revenueRepository = require('../revenues/revenue.repository');
const expenseRepository = require('../expenses/expense.repository');
const paymentRepository = require('../payments/payment.repository');
const { dayjs } = require('../../utils/date.util');

/**
 * Cross-ledger financial reporting.
 *
 * Reads both ledgers and the payments collection to produce the figures the
 * dashboard and the finance screens need: totals, net profit, monthly series and
 * outstanding receivables.
 */
class FinanceService {
  constructor({
    revenues = revenueRepository,
    expenses = expenseRepository,
    payments = paymentRepository,
  } = {}) {
    this.revenues = revenues;
    this.expenses = expenses;
    this.payments = payments;
  }

  /** Round to two decimals — money must never carry float noise into a response. */
  static round(value) {
    return Math.round((value || 0) * 100) / 100;
  }

  /**
   * Headline figures: lifetime and current-month totals plus net profit.
   */
  async summary() {
    const [totalRevenue, totalExpenses, monthlyRevenue, monthlyExpenses, receivables] =
      await Promise.all([
        this.revenues.total(),
        this.expenses.total(),
        this.revenues.monthlyTotal(),
        this.expenses.monthlyTotal(),
        this.payments.summarize(),
      ]);

    return {
      totalRevenue,
      totalExpenses,
      netProfit: FinanceService.round(totalRevenue - totalExpenses),
      currentMonth: {
        period: dayjs.utc().format('YYYY-MM'),
        revenue: monthlyRevenue,
        expenses: monthlyExpenses,
        netProfit: FinanceService.round(monthlyRevenue - monthlyExpenses),
      },
      receivables: {
        outstanding: receivables.outstanding,
        pending: receivables.pending,
        late: receivables.late,
        paid: receivables.paid,
        totalBilled: receivables.totalBilled,
      },
    };
  }

  /** Totals for one specific month. */
  async monthlySummary(year, month) {
    const [revenue, expenses] = await Promise.all([
      this.revenues.monthlyTotal(year, month),
      this.expenses.monthlyTotal(year, month),
    ]);
    return {
      year: year || dayjs.utc().year(),
      month: month || dayjs.utc().month() + 1,
      revenue,
      expenses,
      netProfit: FinanceService.round(revenue - expenses),
    };
  }

  /**
   * Combined monthly series, aligned so every period appears in both ledgers.
   * Missing months are emitted as zeroes rather than gaps, which keeps charts honest.
   */
  async monthlySeries(months = 12) {
    const [revenueSeries, expenseSeries] = await Promise.all([
      this.revenues.monthlySeries(months),
      this.expenses.monthlySeries(months),
    ]);

    const revenueByPeriod = new Map(revenueSeries.map((row) => [row.period, row.total]));
    const expenseByPeriod = new Map(expenseSeries.map((row) => [row.period, row.total]));

    const series = [];
    const cursor = dayjs
      .utc()
      .startOf('month')
      .subtract(months - 1, 'month');

    for (let index = 0; index < months; index += 1) {
      const month = cursor.add(index, 'month');
      const period = month.format('YYYY-MM');
      const revenue = revenueByPeriod.get(period) || 0;
      const expenses = expenseByPeriod.get(period) || 0;
      series.push({
        period,
        year: month.year(),
        month: month.month() + 1,
        revenue,
        expenses,
        netProfit: FinanceService.round(revenue - expenses),
      });
    }

    return series;
  }

  /** Category breakdowns for both ledgers side by side. */
  async breakdown() {
    const [revenueByCategory, expenseByCategory] = await Promise.all([
      this.revenues.byCategory(),
      this.expenses.byCategory(),
    ]);
    return { revenue: revenueByCategory, expenses: expenseByCategory };
  }
}

module.exports = new FinanceService();
module.exports.FinanceService = FinanceService;
