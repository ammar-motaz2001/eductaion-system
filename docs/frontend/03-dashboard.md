# Frontend Integration — Dashboard Module

> Build order so far: **Auth → Students → Dashboard (this doc).**
> This is **instructor-only** — every endpoint below returns `403` for a student.
> Nothing here needs its own screens beyond tiles/charts; it's read-only aggregation
> over data the other modules create.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` (instructor role) on every endpoint.

⚠️ **Heads up:** figures will look like mostly-zeros until you have real data —
attendance, grades, homework, payments and finance tiles are only non-zero once the
Attendance/Grades/Payments/Revenue/Expense modules have been used. Build this screen
now, but don't be surprised by zeros until later modules are wired up too.

---

## Contents

- [Endpoint reference](#endpoint-reference)
  1. [Full dashboard](#1-full-dashboard)
  2. [Quick stats](#2-quick-stats)
  3. [Action items](#3-action-items)
  4. [Trends](#4-trends)
  5. [Recent activity](#5-recent-activity)
- [Quick reference table](#quick-reference-table)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Polling / refresh strategy](#polling--refresh-strategy)
- [Error handling checklist](#error-handling-checklist)

---

## Endpoint reference

### 1. Full dashboard
`GET /dashboard`

Aggregates everything in one call: student counts, content totals, today's
attendance, payment status totals, revenue/expenses/net profit, activation-code
counts, unread notifications. **Overdue payments are swept to `late` before the
figures are computed**, so nothing here is stale.

**Response `200`** (real payload, captured from a running instance):
```json
{
  "success": true,
  "message": "Dashboard statistics retrieved successfully",
  "data": {
    "students": {
      "total": 132,
      "active": 120,
      "pending": 12,
      "attendanceWarnings": 7,
      "averageAttendancePercentage": 82.4
    },
    "content": {
      "totalCollections": 9,
      "activeCollections": 8,
      "totalLessons": 146,
      "totalHomework": 58,
      "totalAttachments": 23,
      "totalGrades": 412
    },
    "attendance": {
      "today": { "pending": 3, "present": 42, "absent": 5, "total": 50, "attendancePercentage": 89.36 },
      "pendingApprovals": 3,
      "warningThreshold": 50,
      "warnings": 7,
      "overallPercentage": 82.4
    },
    "payments": {
      "pending": { "count": 12, "total": 6000 },
      "paid": { "count": 48, "total": 24000 },
      "late": { "count": 5, "total": 2500 },
      "outstanding": 8500,
      "totalBilled": 32500
    },
    "finance": {
      "totalRevenue": 128400,
      "totalExpenses": 74200,
      "netProfit": 54200,
      "currentMonth": { "period": "2026-08", "revenue": 18600, "expenses": 9100, "netProfit": 9500 }
    },
    "activationCodes": { "unused": 12, "used": 45, "revoked": 2, "expired": 3 },
    "notifications": { "unread": 7 },
    "generatedAt": "2026-08-06T18:04:58.131Z"
  },
  "timestamp": "..."
}
```

**Field-by-field, what to build with each:**

| Path | Type | Tile idea |
|---|---|---|
| `students.total` / `.active` / `.pending` | number | 3-up stat cards at the top |
| `students.attendanceWarnings` | number | red badge — "N students below 50% attendance" |
| `students.averageAttendancePercentage` | number (0–100) | gauge/ring chart |
| `content.totalCollections` / `.activeCollections` | number | "8 of 9 collections active" |
| `content.totalLessons` / `.totalHomework` / `.totalAttachments` / `.totalGrades` | number | content-library summary row |
| `attendance.today` | `{pending, present, absent, total, attendancePercentage}` | "Today" attendance donut/bar |
| `attendance.pendingApprovals` | number | link straight to the attendance-review queue |
| `attendance.warningThreshold` | number | show as context next to the warnings count (e.g. "below 50%") |
| `payments.pending/.paid/.late` | `{count, total}` each | 3-segment payment status bar |
| `payments.outstanding` | number (currency) | headline "money owed" figure |
| `finance.totalRevenue/.totalExpenses/.netProfit` | number (currency) | 3-up finance cards |
| `finance.currentMonth` | `{period, revenue, expenses, netProfit}` | "This month" sub-panel under the finance cards |
| `activationCodes` | `{unused, used, revoked, expired}` | small stat row, or omit if not relevant to your dashboard design |
| `notifications.unread` | number | badge on the bell icon (also available faster via `GET /notifications/summary`, see the Notifications doc) |
| `generatedAt` | ISO string | show as "Updated at HH:MM" so users trust the data is live |

---

### 2. Quick stats
`GET /dashboard/quick-stats`

A cheap subset of #1 — use this for a header strip you refresh often, instead of
hitting the full dashboard repeatedly.

**Response `200`:**
```json
{
  "success": true,
  "message": "Quick statistics retrieved successfully",
  "data": {
    "totalStudents": 132,
    "activeStudents": 120,
    "pendingStudents": 12,
    "attendanceToday": 89.36,
    "outstandingPayments": 8500,
    "attendanceWarnings": 7
  },
  "timestamp": "..."
}
```

---

### 3. Action items
`GET /dashboard/action-items`

Everything currently waiting on the instructor — this is your **"To-Do" widget**.

**Response `200`:**
```json
{
  "success": true,
  "message": "Action items retrieved successfully",
  "data": {
    "pendingStudentApprovals": 12,
    "pendingAttendanceApprovals": 3,
    "latePayments": 5,
    "unreadCriticalNotifications": 4,
    "total": 20
  },
  "timestamp": "..."
}
```
`total` is just the sum of the three counts (not including `unreadCriticalNotifications`) —
use it directly as a badge count on a "Tasks" nav item; use the individual fields to
render each row with a deep link:

| Field | Deep link target |
|---|---|
| `pendingStudentApprovals` | Students → Pending queue (`GET /students/pending`) |
| `pendingAttendanceApprovals` | Attendance → Pending review queue |
| `latePayments` | Payments → filtered to `status=late` |
| `unreadCriticalNotifications` | Notifications panel |

---

### 4. Trends
`GET /dashboard/trends`

Monthly finance series + a lesson-type breakdown, for charts.

| Query param | Default | Range |
|---|---|---|
| `months` | `6` | 1–36 |

Example: `GET /dashboard/trends?months=12`

**Response `200`:**
```json
{
  "success": true,
  "message": "Trends retrieved successfully",
  "data": {
    "finance": [
      { "period": "2026-03", "year": 2026, "month": 3, "revenue": 15200, "expenses": 8000, "netProfit": 7200 },
      { "period": "2026-04", "year": 2026, "month": 4, "revenue": 16800, "expenses": 8400, "netProfit": 8400 },
      { "period": "2026-08", "year": 2026, "month": 8, "revenue": 18600, "expenses": 9100, "netProfit": 9500 }
    ],
    "lessonsByFileKind": [
      { "kind": "pdf", "count": 88 },
      { "kind": "video", "count": 34 },
      { "kind": "image", "count": 24 }
    ]
  },
  "timestamp": "..."
}
```
- `finance` is **always exactly `months` entries**, oldest first, one per calendar month
  — months with no activity still appear with `revenue: 0, expenses: 0, netProfit: 0`.
  This means you can feed it straight into a line/bar chart without gap-filling logic.
- `lessonsByFileKind.kind` is one of `pdf`, `image`, `document`, `presentation`,
  `spreadsheet`, `video`, `other` — good for a small pie/donut chart in a content-library
  widget.

---

### 5. Recent activity
`GET /dashboard/recent-activity`

Most recently created students, payments, homework and lessons — for an activity feed.

| Query param | Default | Range |
|---|---|---|
| `limit` | `10` | 1–50 |

Example: `GET /dashboard/recent-activity?limit=5`

**Response `200`** (real payload — note empty arrays are normal on a fresh instance):
```json
{
  "success": true,
  "message": "Recent activity retrieved successfully",
  "data": {
    "students": [
      { "id": "6a74c5ad227980ef471106ce", "fullName": "Ammar Shams", "status": "pending", "createdAt": "2026-08-06T17:34:37.021Z" }
    ],
    "payments": [
      { "id": "...", "amount": 500, "status": "pending", "dueDate": "...", "createdAt": "...", "student": { "id": "...", "fullName": "Omar Khaled" } }
    ],
    "homework": [
      { "id": "...", "title": "Chapter 4 problem set", "dueDate": "...", "createdAt": "..." }
    ],
    "lessons": [
      { "id": "...", "lessonName": "Newton's Laws", "createdAt": "..." }
    ]
  },
  "timestamp": "..."
}
```
Each of the four arrays is independently limited to `limit` items and sorted newest
first (`createdAt` descending) — they are **not** merged/interleaved into one combined
timeline. If you want a single chronological feed, merge and re-sort them client-side
by `createdAt`; each item already carries enough info (`fullName`/`title`/`lessonName`)
to render a one-line summary without a follow-up request.

---

## Quick reference table

| # | Purpose | Method & URL | Query params |
|---|---|---|---|
| 1 | Full dashboard | `GET /dashboard` | — |
| 2 | Quick stats (cheap) | `GET /dashboard/quick-stats` | — |
| 3 | Action items / to-do | `GET /dashboard/action-items` | — |
| 4 | Trends (charts) | `GET /dashboard/trends` | `months` (1–36, default 6) |
| 5 | Recent activity feed | `GET /dashboard/recent-activity` | `limit` (1–50, default 10) |

All five: **instructor only**, no request body, `GET` only.

---

## Frontend build plan

1. **Header strip** — 4–6 small stat cards fed by `GET /dashboard/quick-stats` (#2).
   Cheapest call, refresh this most often (e.g. every 60s or on tab focus).
2. **Main dashboard grid** — fed by `GET /dashboard` (#1) on page load:
   - Student status cards (`students.*`)
   - Today's attendance donut (`attendance.today`)
   - Payment status bar (`payments.*`)
   - Finance summary cards (`finance.*`)
3. **"To-Do" / action items widget** — `GET /dashboard/action-items` (#3), each row
   deep-linking into the relevant module's filtered view.
4. **Trends chart** — `GET /dashboard/trends?months=6` (#4) once you have a charting
   library in place; feed `data.finance` directly into a line chart (revenue vs.
   expenses vs. net profit), and `data.lessonsByFileKind` into a small donut.
5. **Recent activity feed** — `GET /dashboard/recent-activity?limit=10` (#5) as a
   sidebar or bottom panel; merge the four arrays and sort by `createdAt` if you want
   one unified feed instead of four separate lists.

**Don't build this in isolation** — most tiles depend on data from modules you haven't
built yet (Attendance, Grades, Payments, Revenue/Expense). It's fine to ship the layout
now with real zeros; just don't be alarmed when nothing moves until those modules exist.

---

## Suggested API client

```js
// dashboard.api.js
const BASE = '/dashboard';

export const getDashboard = () => apiFetch(BASE);

export const getQuickStats = () => apiFetch(`${BASE}/quick-stats`);

export const getActionItems = () => apiFetch(`${BASE}/action-items`);

export const getTrends = (months = 6) =>
  apiFetch(`${BASE}/trends?${new URLSearchParams({ months })}`);

export const getRecentActivity = (limit = 10) =>
  apiFetch(`${BASE}/recent-activity?${new URLSearchParams({ limit })}`);
```

---

## Polling / refresh strategy

There's no push/websocket layer here — everything is pull. Reasonable defaults:

| Data | Suggested refresh |
|---|---|
| Quick stats (#2) | on tab focus, or a light 60s interval |
| Full dashboard (#1) | on page load / manual refresh button; it's the most expensive of the five (touches ~9 collections server-side) |
| Action items (#3) | on page load + after any action that would change it (approving a student, marking a payment paid, etc. — if you're on the same page) |
| Trends (#4) | on page load only, or when the user changes the `months` selector |
| Recent activity (#5) | on page load, or a manual "refresh" button — not worth polling |

Avoid polling `GET /dashboard` (#1) aggressively — it's the heaviest endpoint in the
whole API by design (it exists to save you nine separate requests, not to be called
every few seconds).

---

## Error handling checklist

| Status | `error.code` | Meaning | UI response |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | not logged in / expired | handled by your shared Auth interceptor |
| 403 | `INSUFFICIENT_ROLE` | a student somehow reached this screen | redirect students away from the dashboard route entirely (guard the route, don't just rely on the API) |
| 422 | `UNPROCESSABLE_ENTITY` | `months` or `limit` out of range | shouldn't happen if you use the dropdown ranges above (1–36 and 1–50) |

---

*Previous: [`02-students.md`](./02-students.md). Next: build **Collections** — it feeds
several of the zeros you're currently seeing on this dashboard (`content.totalCollections`,
enrolment-driven attendance/payments, etc.).*
