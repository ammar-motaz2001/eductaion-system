# Frontend Integration — Payments Module

> Build order so far: **Auth → Students → Dashboard → Collections → Attendance → Grades → Payments (this doc).**
> Requires Collections + enrolment. This module also writes into the Revenue ledger
> (Finance module, not yet documented) whenever a payment is settled.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` on everything below.

**Role split:**
| Action | instructor | student |
|---|---|---|
| Record / update / delete payments | ✅ | ❌ |
| Mark paid / late / reverse | ✅ | ❌ |
| Generate monthly invoices | ✅ | ❌ |
| View own payment history | — | ✅ |
| View any student's payments | ✅ | ❌ (only their own) |
| View totals / summary | ✅ | ❌ |

---

## The core idea: status is derived, never trusted

This is the single most important thing to understand before building UI for this
module:

> A payment's `status` is **not** something you set and forget. `pending` items whose
> `dueDate` has passed are automatically swept to `late` **on every read** — there's no
> background job, it happens inline when you call any list/summary endpoint. And
> settling a payment (`/pay`) **writes a matching entry into the Revenue ledger**;
> reversing or deleting it **removes that entry**. You never manage the revenue side
> yourself — it's a side effect you get for free, and you should never build a "create
> revenue for this payment" button, because the two dedicated endpoints already do it.

---

## Contents

- [Endpoint reference](#endpoint-reference)
  1. [Record a payment](#1-record-a-payment)
  2. [List all payments (with summary)](#2-list-all-payments-with-summary)
  3. [A student's payment history](#3-a-students-payment-history)
  4. [Your own payments (student)](#4-your-own-payments-student)
  5. [Get / update / delete one payment](#5-get--update--delete-one-payment)
  6. [Mark as paid](#6-mark-as-paid)
  7. [Mark as late](#7-mark-as-late)
  8. [Reverse a settlement](#8-reverse-a-settlement)
  9. [Generate monthly invoices](#9-generate-monthly-invoices)
  10. [Payment status summary](#10-payment-status-summary)
  11. [Payment methods](#11-payment-methods)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Error handling checklist](#error-handling-checklist)

---

## Endpoint reference

### 1. Record a payment
`POST /payments` — **instructor only**

```json
{
  "student": "6a6d3bb92b51705e3108abee",
  "collectionId": "6a74d01c227980ef471108da",
  "dueDate": "2026-09-01",
  "description": "September subscription"
}
```

| Field | Required | Notes |
|---|---|---|
| `student`, `collectionId` | ✅ | student must be enrolled in that collection |
| `dueDate` | ✅ | ISO date |
| `amount` | ❌ | **defaults to the collection's `monthlySubscriptionPrice`** if omitted |
| `currency` | ❌ | 3-letter code, default `"EGP"` |
| `description` | ❌ | free text, e.g. "September subscription" |
| `reference` | ❌ | free text, e.g. a receipt/invoice number |
| `notes` | ❌ | |
| `paidDate`, `status` | ❌ | only set these if you're recording a **historical, already-settled** payment — see below |

**Response `201`** — real payload, `amount` defaulted from the collection's price:
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "id": "6a74da4c227980ef47110ce7",
    "student": "6a6d3bb92b51705e3108abee",
    "collectionId": "6a74d01c227980ef471108da",
    "amount": 10,
    "currency": "EGP",
    "dueDate": "2026-09-01T00:00:00.000Z",
    "paidDate": null,
    "paymentMethod": null,
    "status": "pending",
    "description": "September subscription",
    "revenue": null,
    "recordedBy": "6a6d3bb82b51705e3108abaa",
    "daysOverdue": 0,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```

**Real payload — a `dueDate` in the past is auto-classified `late` on creation, not `pending`:**
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "id": "6a74da4c227980ef47110cee",
    "student": "6a6d3bb92b51705e3108abe0",
    "collectionId": "6a74d01c227980ef471108da",
    "amount": 200,
    "currency": "EGP",
    "dueDate": "2026-07-01T00:00:00.000Z",
    "paidDate": null,
    "paymentMethod": null,
    "status": "late",
    "description": "July balance",
    "revenue": null,
    "recordedBy": "...",
    "daysOverdue": 36,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
`daysOverdue` is a live-computed virtual (days since `dueDate`, `0` while `status` is
`paid`) — safe to render directly as "36 days overdue" without doing date math yourself.

If you pass `status: "paid"` (or a `paidDate`) at creation time — for backfilling
historical records — a revenue entry is written immediately, same as calling #6.

**Errors:** `400` — student not enrolled in that collection · `404` collection not found.

---

### 2. List all payments (with summary)
`GET /payments` — **instructor only**

Sweeps overdue payments to `late` **before** computing anything, so this is always current.

| Query param | Notes |
|---|---|
| `page`, `limit`, `sort`, `search` | search matches `description`/`reference`/`notes` |
| `student`, `collection` | |
| `status` | `pending` \| `paid` \| `late` |
| `dueDate` | exact or range: `?dueDate[lte]=2026-08-31` |

**Response `200`** — note the `meta.summary` block riding along with pagination, same
pattern as the Grades module:
```json
{
  "success": true,
  "message": "Payments retrieved successfully",
  "data": [ { "id": "...", "amount": 200, "status": "late", "...": "..." } ],
  "meta": {
    "pagination": { "total": 12, "count": 12, "page": 1, "limit": 20, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false },
    "summary": {
      "pending": { "count": 4, "total": 1800 },
      "paid": { "count": 6, "total": 3000 },
      "late": { "count": 2, "total": 400 },
      "outstanding": 2200,
      "totalBilled": 5200
    }
  },
  "timestamp": "..."
}
```
`outstanding` = `pending.total + late.total`. `totalBilled` = all three added together.
Bind these two directly to your "money owed" headline stats — no client-side math needed.

---

### 3. A student's payment history
`GET /payments/student/{studentId}` — **instructor** (any) / **student** (own only — `403` otherwise)

Same query params and same `meta.summary` shape as #2, scoped to one student.

---

### 4. Your own payments (student)
`GET /payments/me` — **student only**

Identical to #3, scoped to the caller automatically.

---

### 5. Get / update / delete one payment
`GET /payments/{id}` · `PATCH /payments/{id}` · `DELETE /payments/{id}` — **instructor only**

**PATCH body** — deliberately limited; **status/paidDate are NOT patchable here**
(use #6/#7/#8 instead, so the revenue ledger can never drift out of sync):
```json
{ "amount": 550, "dueDate": "2026-09-05", "description": "Adjusted amount", "reference": "INV-0912" }
```
Sending `status` or `paidDate` in this body is silently ignored — it's stripped before
the update runs, not rejected. Don't rely on a client-side check for this alone; the
server just won't apply it.

**DELETE:** removes the payment **and** its mirrored revenue entry (if it had one, i.e.
was already paid). `{ "data": { "id": "..." } }`.

---

### 6. Mark as paid
`PATCH /payments/{id}/pay` — **instructor only**

```json
{ "paymentMethod": "cash", "reference": "REC-4471" }
```
All fields optional — `paidDate` defaults to now if omitted.

**Response `200`** — **idempotent**, note the `alreadyPaid` distinction in the message:
```json
{ "success": true, "message": "Payment marked as paid successfully", "data": { "status": "paid", "paidDate": "...", "revenue": "6a74...", "...": "..." }, "timestamp": "..." }
```
Calling it again on an already-paid payment returns `200` with
`"message": "Payment was already settled"` and the unchanged record — **not an error**,
so don't treat a double-click here as a failure state.

This is also the exact moment a **Revenue** entry gets created (category `"tuition"`) —
`data.revenue` holds its id afterward.

---

### 7. Mark as late
`PATCH /payments/{id}/late` — **instructor only**

```json
{ "notes": "Follow-up call made, no response" }
```
For manually flagging something late outside the automatic due-date sweep, or after
reversing a mistaken settlement.

**Errors:** `409` — a payment that's currently `paid` cannot be marked late directly;
reverse it first (#8).

---

### 8. Reverse a settlement
`PATCH /payments/{id}/reverse` — **instructor only**, no body

Undoes a `pay` — **removes the mirrored revenue entry** and returns the payment to
`pending` or `late` (whichever the due date now implies).

**Errors:** `409` — only a currently-`paid` payment can be reversed.

Use this for "oops, marked the wrong student paid" — not a general-purpose undo for
anything else.

---

### 9. Generate monthly invoices
`POST /payments/generate-invoices` — **instructor only**

Creates one payment per **enrolled** student in a collection — the "bill everyone for
this month" button.

```json
{
  "collectionId": "6a74d01c227980ef471108da",
  "dueDate": "2026-09-01",
  "description": "September 2026 subscription"
}
```
`amount` optional (defaults to the collection's monthly price, same as #1).

**Response `201`** — **partial success**, and **safe to call twice**:
```json
{
  "success": true,
  "message": "18 invoice(s) generated, 2 skipped",
  "data": {
    "amount": 500,
    "dueDate": "2026-09-01T00:00:00.000Z",
    "created": [ { "student": "665f...", "payment": "665f..." } ],
    "skipped": [ { "student": "665f...", "reason": "An invoice for this period already exists" } ]
  },
  "timestamp": "..."
}
```
The dedup key is the exact `description` string — if you call this twice with the same
`description` for the same collection, the second call skips everyone (no duplicate
bills). If you want to re-run it, either use a different `description` or accept that
already-invoiced students are correctly skipped. This is your **"Bill this month"**
button — safe to wire to a single click with no extra confirmation needed against
double-submission.

---

### 10. Payment status summary
`GET /payments/summary` — **instructor only**, no params

Same sweep-then-summarize behavior as #2, but standalone — no pagination, no records,
just the totals. Use this for a lightweight dashboard tile instead of loading the full
list.

**Response `200`:**
```json
{
  "success": true,
  "message": "Payment summary retrieved successfully",
  "data": {
    "pending": { "count": 4, "total": 1800 },
    "paid": { "count": 6, "total": 3000 },
    "late": { "count": 2, "total": 400 },
    "outstanding": 2200,
    "totalBilled": 5200
  },
  "timestamp": "..."
}
```

---

### 11. Payment methods
`GET /payments/methods` — **instructor only**

**Response `200`:**
```json
{ "success": true, "message": "Payment methods retrieved successfully", "data": ["cash", "bank-transfer", "card", "wallet", "other"], "timestamp": "..." }
```
Wire your `paymentMethod` dropdown to this once.

---

## Quick reference table

| # | Action | Method & URL | Who |
|---|---|---|---|
| 1 | Record a payment | `POST /payments` | instructor |
| 2 | List all (+ summary) | `GET /payments` | instructor |
| 3 | A student's history | `GET /payments/student/{studentId}` | both (scoped) |
| 4 | Own payments | `GET /payments/me` | student |
| 5 | Get / update / delete | `GET`/`PATCH`/`DELETE /payments/{id}` | instructor |
| 6 | Mark paid | `PATCH /payments/{id}/pay` | instructor |
| 7 | Mark late | `PATCH /payments/{id}/late` | instructor |
| 8 | Reverse settlement | `PATCH /payments/{id}/reverse` | instructor |
| 9 | Generate monthly invoices | `POST /payments/generate-invoices` | instructor |
| 10 | Status summary | `GET /payments/summary` | instructor |
| 11 | Payment methods | `GET /payments/methods` | instructor |

---

## Data shapes

**`status`** — `"pending"` \| `"paid"` \| `"late"` (derived, never set directly except at creation-time backfill)

**`paymentMethod`** — `"cash"` \| `"bank-transfer"` \| `"card"` \| `"wallet"` \| `"other"`

**Full payment object:**
```ts
{
  id: string
  student: string | { id, fullName, email, phone, parentPhone }   // populated on most GETs
  collectionId: string | { id, name, subject, monthlySubscriptionPrice }
  amount: number
  currency: string          // e.g. "EGP"
  dueDate: string           // ISO date
  paidDate: string | null
  paymentMethod: string | null
  status: "pending" | "paid" | "late"
  description?: string
  reference?: string
  notes?: string
  revenue: string | null    // Revenue ledger entry id, set once paid
  daysOverdue: number       // live-computed, 0 while paid
  recordedBy: string
  createdAt: string
  updatedAt: string
}
```

**Summary object** (from #2's `meta.summary` and #10):
```ts
{
  pending: { count: number, total: number }
  paid: { count: number, total: number }
  late: { count: number, total: number }
  outstanding: number    // pending.total + late.total
  totalBilled: number     // pending.total + paid.total + late.total
}
```

---

## Frontend build plan

1. **Payments list (instructor)** — #2, table with status filter tabs
   (All / Pending / Paid / Late), summary cards above the table fed by the same
   response's `meta.summary`.
2. **Record a payment form** — #1. Auto-fill `amount` from the collection's
   `monthlySubscriptionPrice` when a collection is picked (fetch the collection object
   from the Collections module and pre-populate the field — the server does this too if
   you omit it, but showing it upfront is better UX).
3. **Row actions** — Mark Paid (#6) as the primary action button; Mark Late (#7) and
   Reverse (#8) as a dropdown menu. Handle the `alreadyPaid`/`409` cases as described
   above rather than generic error toasts.
4. **"Bill this month" button** — #9, on the collection detail page (Collections
   module). Safe to wire without a confirmation dialog since it's idempotent per
   `description` string — just show the `created`/`skipped` counts in a toast afterward.
5. **Student payment history** — #3/#4, reuse the same table component as #1 filtered
   to one student, on both the instructor's student-detail page and the student's own
   profile.
6. **Dashboard tile** — #10 for a lightweight "outstanding balance" stat, instead of
   loading the full list just to get the summary.

**Don't build a "record revenue for this payment" button** — settling via #6 already
does it, and a manual duplicate would double-count in the Finance module later.

---

## Suggested API client

```js
// payments.api.js
const BASE = '/payments';
const qs = (params) => new URLSearchParams(params).toString();

export const recordPayment = (payload) =>
  apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });

export const listPayments = (params) => apiFetch(`${BASE}?${qs(params)}`);

export const listStudentPayments = (studentId, params) =>
  apiFetch(`${BASE}/student/${studentId}?${qs(params)}`);

export const listMyPayments = (params) => apiFetch(`${BASE}/me?${qs(params)}`);

export const getPayment = (id) => apiFetch(`${BASE}/${id}`);

export const updatePayment = (id, payload) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deletePayment = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });

export const markAsPaid = (id, payload = {}) =>
  apiFetch(`${BASE}/${id}/pay`, { method: 'PATCH', body: JSON.stringify(payload) });

export const markAsLate = (id, notes) =>
  apiFetch(`${BASE}/${id}/late`, { method: 'PATCH', body: JSON.stringify({ notes }) });

export const reversePayment = (id) =>
  apiFetch(`${BASE}/${id}/reverse`, { method: 'PATCH' });

export const generateMonthlyInvoices = (payload) =>
  apiFetch(`${BASE}/generate-invoices`, { method: 'POST', body: JSON.stringify(payload) });

export const getPaymentSummary = () => apiFetch(`${BASE}/summary`);

export const getPaymentMethods = () => apiFetch(`${BASE}/methods`);
```

---

## Error handling checklist

| Status | `error.code` | Meaning here | UI response |
|---|---|---|---|
| 400 | `BAD_REQUEST` | student not enrolled in the collection | inline message, or filter the student picker to enrolled students only |
| 403 | `INSUFFICIENT_ROLE` / `FORBIDDEN` | student hit an instructor-only endpoint, or requested another student's payments | hide the control for student accounts |
| 404 | `NOT_FOUND` | bad `{id}` / collection not found | redirect / remove row |
| 409 | `CONFLICT` | mark-late on a paid payment (#7), or reverse on a non-paid payment (#8) | show the message — both are already user-facing text |
| 422 | `UNPROCESSABLE_ENTITY` | validation — check `error.details[].field` | map to form fields |

Note **mark-as-paid (#6) never errors on a repeat call** — check `data.status` /
the response message for `"already settled"` instead of expecting a `409` there.

---

*Previous: [`06-grades.md`](./06-grades.md). Next up: **Finance** (Revenue & Expense
ledgers + combined summary) — it's the natural continuation since Payments already
writes into it, or **Notifications** if you want the bell icon working first.*
