# Frontend Integration — Finance Module

> Build order so far: **Auth → Students → Dashboard → Collections → Attendance →
> Grades → Payments → Notifications → Finance (this doc).**
> This doc covers **three** route groups together because they're one financial
> picture: **Revenues**, **Expenses**, and the **combined Finance summary**.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` — **instructor only, everything in this
doc**. There is no student-facing view of any finance data.

---

## How the three pieces fit together

```
Revenue ledger  ──┐
  /revenues        │
  (income:          ├──►  Finance summary
   tuition,         │       /finance/*
   subscriptions,   │     total revenue, total expenses,
   books, ...)       │     net profit, monthly series,
                      │     category breakdown — reads
Expense ledger ──────┘     BOTH ledgers, writes neither
  /expenses
  (outgoing: rent,
   salaries, ...)

Settling a Payment (Payments module, /payments/{id}/pay)
   ──► automatically writes a Revenue entry (category "tuition")
   ──► reversing/deleting that payment removes the entry
```

**Revenues and Expenses are structurally identical APIs** — same fields, same
endpoints, same response shapes — they only differ in their category vocabulary. If
you build one, you've built both; just point it at a different base path and category
list.

**Finance is read-only** — it has no create/update/delete of its own. It's purely an
aggregation view over the two ledgers, for dashboards and reports. Use Revenues/Expenses
for data entry, use Finance for reporting.

---

## Contents

- [Part A — Revenues & Expenses (identical APIs)](#part-a--revenues--expenses-identical-apis)
  1. [Create an entry](#1-create-an-entry)
  2. [List entries](#2-list-entries)
  3. [Get / update / delete one entry](#3-get--update--delete-one-entry)
  4. [Overview](#4-overview)
  5. [Monthly total](#5-monthly-total)
  6. [Monthly series](#6-monthly-series)
  7. [Categories](#7-categories)
- [Part B — Finance (combined, read-only)](#part-b--finance-combined-read-only)
  8. [Financial summary](#8-financial-summary)
  9. [Monthly summary](#9-monthly-summary)
  10. [Monthly series (combined)](#10-monthly-series-combined)
  11. [Category breakdown (combined)](#11-category-breakdown-combined)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Error handling checklist](#error-handling-checklist)

---

## Part A — Revenues & Expenses (identical APIs)

Everything below applies to **both** `/revenues` and `/expenses` — just swap the base
path. Differences are called out explicitly where they exist (category values only).

### 1. Create an entry
`POST /revenues` or `POST /expenses` — **instructor only**

```json
{ "title": "Textbook sales", "amount": 1250, "category": "books", "date": "2026-08-05" }
```

| Field | Required | Notes |
|---|---|---|
| `title` | ✅ | 2–200 chars |
| `amount` | ✅ | ≥ 0 |
| `category` | ✅ | **different enum per ledger** — see [#7](#7-categories) |
| `date` | ❌ | defaults to now |
| `currency` | ❌ | 3-letter code, default `"EGP"` |
| `notes` | ❌ | up to 2000 chars |

**Response `201`** — real payload from `/revenues`:
```json
{
  "success": true,
  "message": "Revenue created successfully",
  "data": {
    "id": "6a7552c2227980ef47110fa9",
    "title": "Textbook sales",
    "amount": 1250,
    "currency": "EGP",
    "category": "books",
    "date": "2026-08-05T00:00:00.000Z",
    "payment": null,
    "student": null,
    "collectionId": null,
    "createdBy": "6a6d3bb82b51705e3108abaa",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
`payment`/`student`/`collectionId` are `null` here because this was entered manually —
these three fields are only populated on entries **auto-created by settling a payment**
(see the Payments module doc, `PATCH /payments/{id}/pay`). You never set them yourself
through this endpoint; there's no field for it in the request body.

**Errors:** `422` — `category` not in that ledger's vocabulary. This is the most common
mistake: sending an expense category (`"rent"`) to `/revenues`, or vice versa —
```json
{
  "error": {
    "code": "UNPROCESSABLE_ENTITY", "statusCode": 422,
    "details": [{ "field": "category", "message": "Invalid enum value. Expected 'rent' | 'salaries' | 'utilities' | 'equipment' | 'marketing' | 'maintenance' | 'other', received 'tuition'" }]
  }
}
```
The error message conveniently lists the valid values for that ledger — you could parse
it, but calling #7 for your dropdown is cleaner.

---

### 2. List entries
`GET /revenues` or `GET /expenses` — **instructor only**

| Query param | Notes |
|---|---|
| `page`, `limit`, `sort`, `search` | search matches `title`/`notes` |
| `category` | |
| `collection` | filter to entries tied to one collection (payment-generated entries only) |
| `student` | filter to entries tied to one student (payment-generated entries only) |
| `date` | exact or range: `?date[gte]=2026-01-01` |
| `amount` | range: `?amount[gte]=1000` |

**Response `200`:** standard paginated envelope, array of entries (same shape as #1's
response), `createdBy`/`student`/`collectionId` populated to `{id, ...}` objects on
list/detail reads (unlike the bare-id create response).

---

### 3. Get / update / delete one entry
`GET`/`PATCH`/`DELETE /revenues/{id}` or `.../expenses/{id}` — **instructor only**

**PATCH body** — same fields as create, all optional:
```json
{ "amount": 1300, "notes": "Corrected count after recount" }
```

**⚠️ Be careful deleting payment-generated entries.** An entry created automatically by
settling a payment (`payment` field is non-null) is soft-deleted like any other record
if you call `DELETE` here directly — but the *payment* it came from won't know its
revenue link is gone. **Always reverse or delete the payment itself** (Payments module)
rather than deleting its mirrored revenue entry directly, or the two will drift out of
sync. Consider hiding the delete button in your UI for any row where `payment !== null`.

---

### 4. Overview
`GET /revenues/overview` or `GET /expenses/overview` — **instructor only**, no params

Total, this-month total, and a category breakdown — the single call for a ledger's
summary tile.

**Response `200`:**
```json
{
  "success": true,
  "message": "Revenue overview retrieved successfully",
  "data": {
    "total": 128400,
    "thisMonth": 18600,
    "byCategory": [
      { "category": "tuition", "total": 104000, "count": 208 },
      { "category": "books", "total": 12400, "count": 31 }
    ]
  },
  "timestamp": "..."
}
```
`byCategory` is sorted largest-total-first — safe to feed directly into a horizontal
bar chart without re-sorting.

---

### 5. Monthly total
`GET /revenues/monthly` or `GET /expenses/monthly` — **instructor only**

| Query param | Notes |
|---|---|
| `year`, `month` | both optional — defaults to the current month if omitted |

**Response `200`:**
```json
{ "success": true, "message": "Monthly revenue total retrieved successfully", "data": { "year": 2026, "month": 8, "total": 18600 }, "timestamp": "..." }
```
Use this for a single "this month" or "pick a month" stat, without pulling the whole
series.

---

### 6. Monthly series
`GET /revenues/series` or `GET /expenses/series` — **instructor only**

| Query param | Default | Range |
|---|---|---|
| `months` | `12` | 1–60 |

**Response `200`:**
```json
{
  "success": true,
  "message": "Monthly revenue retrieved successfully",
  "data": [
    { "year": 2026, "month": 7, "period": "2026-07", "total": 17200, "count": 44 },
    { "year": 2026, "month": 8, "period": "2026-08", "total": 18600, "count": 47 }
  ],
  "timestamp": "..."
}
```
**Note:** unlike the combined Finance series (#10), **this one does NOT zero-fill gaps**
— a month with zero entries is simply absent from the array, not present with `total: 0`.
If you're charting a single ledger's series and want continuous months on the x-axis,
you'll need to fill gaps yourself; if you want zero-filled behavior for free, use the
combined series (#10) instead, even if you only care about one ledger (you can ignore
the other field).

---

### 7. Categories
`GET /revenues/categories` or `GET /expenses/categories` — **instructor only**

**Response `200`** — revenues:
```json
{ "success": true, "data": ["tuition", "subscription", "books", "exam-fees", "donation", "other"] }
```
**Response `200`** — expenses:
```json
{ "success": true, "data": ["rent", "salaries", "utilities", "equipment", "marketing", "maintenance", "other"] }
```
Wire your category dropdown to whichever ledger's endpoint matches the form you're
building — **don't share one dropdown component between both forms** unless you swap
its options based on which ledger is active, since the values are mutually exclusive
sets.

---

## Part B — Finance (combined, read-only)

Base path `/finance`. No create/update/delete — read-only aggregation over both ledgers.

### 8. Financial summary
`GET /finance/summary` — **instructor only**, no params

The single richest call in this module — headline totals plus receivables (which
duplicates data you've already seen in the Payments module's summary endpoint, included
here for convenience so Finance can be a one-stop dashboard).

**Response `200`:**
```json
{
  "success": true,
  "message": "Financial summary retrieved successfully",
  "data": {
    "totalRevenue": 128400,
    "totalExpenses": 74200,
    "netProfit": 54200,
    "currentMonth": { "period": "2026-08", "revenue": 18600, "expenses": 9100, "netProfit": 9500 },
    "receivables": {
      "outstanding": 8500,
      "pending": { "count": 12, "total": 6000 },
      "late": { "count": 5, "total": 2500 },
      "paid": { "count": 48, "total": 24000 },
      "totalBilled": 32500
    }
  },
  "timestamp": "..."
}
```
`netProfit = totalRevenue - totalExpenses`, already computed for you — don't
re-subtract client-side (rounding could disagree by a cent in edge cases; trust the
server's number).

---

### 9. Monthly summary
`GET /finance/monthly` — **instructor only**

| Query param | Notes |
|---|---|
| `year`, `month` | both optional — defaults to current month |

**Response `200`:**
```json
{ "success": true, "message": "Monthly financial summary retrieved successfully", "data": { "year": 2026, "month": 8, "revenue": 18600, "expenses": 9100, "netProfit": 9500 }, "timestamp": "..." }
```

---

### 10. Monthly series (combined)
`GET /finance/series` — **instructor only**

| Query param | Default | Range |
|---|---|---|
| `months` | `12` | 1–60 |

**Response `200`** — **always exactly `months` entries, zero-filled, oldest first**:
```json
{
  "success": true,
  "message": "Monthly financial series retrieved successfully",
  "data": [
    { "period": "2026-07", "year": 2026, "month": 7, "revenue": 17200, "expenses": 8800, "netProfit": 8400 },
    { "period": "2026-08", "year": 2026, "month": 8, "revenue": 18600, "expenses": 9100, "netProfit": 9500 }
  ],
  "timestamp": "..."
}
```
This is the one to use for a revenue-vs-expenses-vs-profit line chart — feed it
directly, no gap-filling or date-math needed on your end (same zero-fill guarantee as
the Dashboard module's `trends.finance`, because it's the exact same underlying call).

---

### 11. Category breakdown (combined)
`GET /finance/breakdown` — **instructor only**, no params

Both ledgers' category breakdowns side by side, in one call.

**Response `200`:**
```json
{
  "success": true,
  "message": "Financial breakdown retrieved successfully",
  "data": {
    "revenue": [
      { "category": "tuition", "total": 104000, "count": 208 },
      { "category": "books", "total": 12400, "count": 31 }
    ],
    "expenses": [
      { "category": "rent", "total": 48000, "count": 8 },
      { "category": "salaries", "total": 20000, "count": 8 }
    ]
  },
  "timestamp": "..."
}
```
Good for a two-panel "where does the money come from / go to" view — each side is
already sorted largest-first.

---

## Quick reference table

| # | Action | Method & URL |
|---|---|---|
| 1 | Create entry | `POST /revenues` \| `POST /expenses` |
| 2 | List entries | `GET /revenues` \| `GET /expenses` |
| 3 | Get / update / delete | `GET`/`PATCH`/`DELETE /revenues/{id}` \| `.../expenses/{id}` |
| 4 | Overview | `GET /revenues/overview` \| `GET /expenses/overview` |
| 5 | Monthly total | `GET /revenues/monthly` \| `GET /expenses/monthly` |
| 6 | Monthly series (single ledger, no zero-fill) | `GET /revenues/series` \| `GET /expenses/series` |
| 7 | Categories | `GET /revenues/categories` \| `GET /expenses/categories` |
| 8 | Combined summary | `GET /finance/summary` |
| 9 | Combined monthly summary | `GET /finance/monthly` |
| 10 | Combined series (zero-filled) | `GET /finance/series` |
| 11 | Combined category breakdown | `GET /finance/breakdown` |

All: **instructor only**.

---

## Data shapes

**Revenue categories** — `"tuition"` \| `"subscription"` \| `"books"` \| `"exam-fees"` \| `"donation"` \| `"other"`

**Expense categories** — `"rent"` \| `"salaries"` \| `"utilities"` \| `"equipment"` \| `"marketing"` \| `"maintenance"` \| `"other"`

**Full ledger entry (revenue or expense, identical shape):**
```ts
{
  id: string
  title: string
  amount: number
  currency: string
  category: string          // enum differs per ledger, see above
  date: string
  notes?: string
  payment: string | null         // set only if auto-generated by settling a payment
  student: string | null         // ditto
  collectionId: string | null    // ditto
  createdBy: string
  createdAt: string
  updatedAt: string
}
```

**Ledger overview** (#4):
```ts
{ total: number, thisMonth: number, byCategory: Array<{ category, total, count }> }
```

**Single-ledger series item** (#6) — no zero-fill:
```ts
{ year: number, month: number, period: string, total: number, count: number }
```

**Combined finance summary** (#8):
```ts
{
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  currentMonth: { period: string, revenue: number, expenses: number, netProfit: number }
  receivables: {
    outstanding: number
    pending: { count: number, total: number }
    late: { count: number, total: number }
    paid: { count: number, total: number }
    totalBilled: number
  }
}
```

**Combined series item** (#10) — zero-filled:
```ts
{ period: string, year: number, month: number, revenue: number, expenses: number, netProfit: number }
```

---

## Frontend build plan

1. **Two entry forms** — Revenue and Expense, built as **one shared component** with a
   `ledger` prop that switches the base path and the category dropdown source (#7).
   Since the APIs are identical, this should genuinely be one component, not two.
2. **Two list pages** — Revenue and Expense, same shared-component approach as above,
   using #2. Each with its own overview cards fed by #4.
3. **Finance dashboard page** — the main payoff screen:
   - Headline cards from #8 (`totalRevenue`, `totalExpenses`, `netProfit`)
   - "This month" sub-panel from `currentMonth`
   - Receivables mini-panel from `receivables` (this duplicates the Payments module's
     summary — you already built this UI once, reuse it)
   - Line chart from #10 (revenue/expenses/profit over time)
   - Two-panel category breakdown from #11
4. **Row-level protection** — in both ledger list pages, disable/hide the delete button
   when `payment !== null` (see the warning in #3) to prevent accidentally
   desynchronizing a payment from its revenue record.

**Build order within this module:** #1–7 (the two ledgers) first, since they're where
data entry happens; #8–11 (Finance) last, since it's pure aggregation over data that
needs to exist first to be interesting.

---

## Suggested API client

```js
// finance.api.js
const qs = (params) => new URLSearchParams(params).toString();

/** Shared factory — Revenue and Expense are identical APIs, differing only in base path. */
function createLedgerClient(base) {
  return {
    create: (payload) => apiFetch(base, { method: 'POST', body: JSON.stringify(payload) }),
    list: (params) => apiFetch(`${base}?${qs(params)}`),
    get: (id) => apiFetch(`${base}/${id}`),
    update: (id, payload) => apiFetch(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    remove: (id) => apiFetch(`${base}/${id}`, { method: 'DELETE' }),
    overview: () => apiFetch(`${base}/overview`),
    monthly: (year, month) => apiFetch(`${base}/monthly?${qs({ year, month })}`),
    series: (months = 12) => apiFetch(`${base}/series?${qs({ months })}`),
    categories: () => apiFetch(`${base}/categories`),
  };
}

export const revenues = createLedgerClient('/revenues');
export const expenses = createLedgerClient('/expenses');

// finance.api.js (continued) — combined, read-only
const FINANCE_BASE = '/finance';

export const getFinanceSummary = () => apiFetch(`${FINANCE_BASE}/summary`);

export const getFinanceMonthly = (year, month) =>
  apiFetch(`${FINANCE_BASE}/monthly?${qs({ year, month })}`);

export const getFinanceSeries = (months = 12) =>
  apiFetch(`${FINANCE_BASE}/series?${qs({ months })}`);

export const getFinanceBreakdown = () => apiFetch(`${FINANCE_BASE}/breakdown`);
```
Usage: `revenues.create({...})`, `expenses.list({ category: 'rent' })`, etc. — one
factory, both ledgers, no duplicated request logic.

---

## Error handling checklist

| Status | `error.code` | Meaning here | UI response |
|---|---|---|---|
| 403 | `INSUFFICIENT_ROLE` | any student reaching this module | guard the entire route — students should never see a Finance nav item |
| 404 | `NOT_FOUND` | bad `{id}` | redirect / remove row |
| 422 | `UNPROCESSABLE_ENTITY` | most commonly: a category from the wrong ledger (see #1) | map `error.details[].field` to form fields; double-check you're using the right ledger's category enum |
| 429 | `TOO_MANY_REQUESTS` | you've hit the API's rate limit from rapid testing | back off and retry after a few seconds — this is a global limiter across the whole API, not specific to Finance |

---

*Previous: [`08-notifications.md`](./08-notifications.md). Next up: **Reports**
(per-student PDF export combining attendance, grades, homework and payments) or
**Lessons/Homework/Attachments** (file uploads) — whichever you need next.*
