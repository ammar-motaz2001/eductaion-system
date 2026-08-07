# Frontend Integration — Notifications Module

> Build order so far: **Auth → Students → Dashboard → Collections → Attendance → Grades
> → Payments → Notifications (this doc).**
> No dependency on any specific module — but by the time you build this, Attendance,
> Grades, Payments and Students have already been silently generating notifications in
> the background. This doc is the payoff: surfacing what's already there.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` on everything below.

**Role split:** none — every endpoint works identically for both instructor and student.
The only scoping rule: **you only ever see your own notifications**, enforced
server-side. There's no `?recipient=` override for instructors; even they only see
notifications addressed to them.

---

## Where notifications come from (you don't create them)

There's no "create notification" endpoint in this module — every notification is a
side effect of something happening elsewhere in the API. You've already triggered all
of these while building the other modules:

| `type` | Fires when | Sent to |
|---|---|---|
| `attendance-warning` | A student's attendance drops below the threshold (default 50%) | the student **and** every instructor |
| `late-payment` | A payment's due date passes unpaid | the student **and** every instructor |
| `pending-attendance-approval` | A student submits attendance (`POST /attendance/submit`) | every instructor |
| `new-homework` | A homework assignment is published | every enrolled student |
| `upcoming-exam` | A grade record is created with a **future** `examDate` | every enrolled student |
| `pending-student-approval` | A student registers (with or without an activation code) | every instructor |

Notifications with a `dedupeKey` (attendance warnings, late payments, pending-approval
items) are **upserted, not duplicated** — re-triggering the same condition refreshes the
existing notification (and flips it back to unread) instead of spamming a new one each
time. This means your unread count won't inflate from a repeatedly-failing condition.

---

## Contents

- [Endpoint reference](#endpoint-reference)
  1. [List your notifications](#1-list-your-notifications)
  2. [Unread summary](#2-unread-summary)
  3. [Get one notification](#3-get-one-notification)
  4. [Mark one as read](#4-mark-one-as-read)
  5. [Mark all as read](#5-mark-all-as-read)
  6. [Delete a notification](#6-delete-a-notification)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Polling strategy](#polling-strategy)
- [Error handling checklist](#error-handling-checklist)

---

## Endpoint reference

### 1. List your notifications
`GET /notifications`

| Query param | Notes |
|---|---|
| `page`, `limit`, `search` | search matches `title`/`message` |
| `type` | one of the six types listed above |
| `severity` | `info` \| `warning` \| `critical` |
| `isRead` | `true` \| `false` |

**Response `200`** — real payload, newest first:
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": [
    {
      "id": "6a74d2c1c1a2f11ce2ef020c",
      "recipient": "6a6d3bb82b51705e3108abaa",
      "type": "pending-attendance-approval",
      "severity": "info",
      "title": "Attendance awaiting review",
      "message": "Yara Hassan submitted attendance for 2026-08-06.",
      "resource": { "model": "Attendance", "id": "6a74d2c1227980ef47110a2b" },
      "data": { "date": "2026-08-06T00:00:00.000Z" },
      "isRead": false,
      "readAt": null,
      "dedupeKey": "pending-attendance:6a74d2c1227980ef47110a2b",
      "createdAt": "2026-08-06T18:30:25.161Z",
      "updatedAt": "2026-08-06T18:30:25.161Z"
    },
    {
      "id": "6a74d28cc1a2f11ce2ef0208",
      "recipient": "6a6d3bb82b51705e3108abaa",
      "type": "attendance-warning",
      "severity": "warning",
      "title": "Low attendance warning",
      "message": "Attendance for Mostafa Ali is 33.33%, below the required 50%.",
      "resource": { "model": "Student", "id": "6a6d3bb92b51705e3108abee" },
      "data": { "percentage": 33.33, "threshold": 50, "studentId": "6a6d3bb92b51705e3108abee" },
      "isRead": false,
      "readAt": null,
      "dedupeKey": "attendance-warning:6a6d3bb92b51705e3108abee",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "pagination": { "total": 8, "count": 5, "page": 1, "limit": 5, "totalPages": 2, "hasPreviousPage": false, "hasNextPage": true } },
  "timestamp": "..."
}
```

`title` and `message` are **already user-facing text** — render them directly, no
client-side templating needed. `data` carries type-specific structured fields (see
[data shapes](#data-shapes)) for when you want to build a richer UI than the plain
message (e.g. a progress bar using `data.percentage`/`data.threshold` for an
attendance-warning notification).

`resource.model` + `resource.id` tell you what to deep-link to — e.g.
`resource.model === "Student"` → link to that student's detail page using `resource.id`.

---

### 2. Unread summary
`GET /notifications/summary`, no params

The cheap call for your bell icon badge — don't paginate through #1 just to count unread.

**Response `200`:**
```json
{
  "success": true,
  "message": "Notification summary retrieved successfully",
  "data": {
    "unread": 8,
    "breakdown": [
      { "type": "pending-student-approval", "count": 6 },
      { "type": "attendance-warning", "count": 1 },
      { "type": "pending-attendance-approval", "count": 1 }
    ]
  },
  "timestamp": "..."
}
```
`breakdown` only lists types that currently have unread items (empty array when
`unread` is `0`) — safe to render as a per-type mini-list in a dropdown without
filtering out zeros yourself.

---

### 3. Get one notification
`GET /notifications/{id}`

Same shape as one item from #1. `404` if it doesn't exist **or belongs to someone
else** — the API doesn't distinguish "not found" from "not yours" (same as most
ownership checks elsewhere in the API), so don't try to detect the difference.

---

### 4. Mark one as read
`PATCH /notifications/{id}/read`, no body

**Response `200`:**
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": { "id": "...", "isRead": true, "readAt": "2026-08-07T03:33:11.076Z", "...": "..." },
  "timestamp": "..."
}
```
Call this when the user opens/clicks a notification, or when it scrolls into view if
you want Gmail-style auto-read-on-view (your call — the API doesn't have an opinion).

---

### 5. Mark all as read
`PATCH /notifications/read-all`, no body

**Response `200`:**
```json
{ "success": true, "message": "7 notification(s) marked as read", "data": { "modified": 7 }, "timestamp": "..." }
```
This is your "mark all as read" button at the top of the notification panel.

---

### 6. Delete a notification
`DELETE /notifications/{id}`

**Response `200`:** `{ "data": { "id": "..." } }`.

Note: **deleting doesn't stop it from coming back.** If the underlying condition is
still true and has a `dedupeKey` (e.g. the student is still below the attendance
threshold), the next time that rule re-evaluates it'll recreate the same notification.
Deletion is for tidying up your inbox, not for dismissing a warning permanently — the
only way to make an `attendance-warning` stop recurring is to fix the actual attendance
percentage.

---

## Quick reference table

| # | Action | Method & URL |
|---|---|---|
| 1 | List | `GET /notifications` |
| 2 | Unread summary | `GET /notifications/summary` |
| 3 | Get one | `GET /notifications/{id}` |
| 4 | Mark one read | `PATCH /notifications/{id}/read` |
| 5 | Mark all read | `PATCH /notifications/read-all` |
| 6 | Delete | `DELETE /notifications/{id}` |

All six: **both roles**, always scoped to the caller.

---

## Data shapes

**`type`** — `"attendance-warning"` \| `"late-payment"` \| `"pending-attendance-approval"`
\| `"new-homework"` \| `"upcoming-exam"` \| `"pending-student-approval"` \| `"general"`

**`severity`** — `"info"` \| `"warning"` \| `"critical"` — use this to color-code the
notification (e.g. blue/yellow/red left border), independent of `type`.

**Full notification object:**
```ts
{
  id: string
  recipient: string
  type: "attendance-warning" | "late-payment" | "pending-attendance-approval"
      | "new-homework" | "upcoming-exam" | "pending-student-approval" | "general"
  severity: "info" | "warning" | "critical"
  title: string           // user-facing, render directly
  message: string         // user-facing, render directly
  resource: { model: string | null, id: string | null }   // deep-link target
  data: Record<string, any>   // type-specific structured payload, see below
  isRead: boolean
  readAt: string | null
  dedupeKey: string | null   // present on recurring-condition types; null on one-shot types
  createdAt: string
  updatedAt: string
}
```

**`data` payload by type** — what you get to build a richer UI than the plain message:
```ts
// attendance-warning
{ percentage: number, threshold: number, studentId: string }

// late-payment
{ amount: number, dueDate: string }

// pending-attendance-approval
{ date: string }

// new-homework
{ dueDate: string, homeworkId: string }

// upcoming-exam
{ examDate: string }

// pending-student-approval
{ studentId: string, email: string }
```

---

## Frontend build plan

1. **Bell icon badge** — poll #2 (`unread` count) for the header badge; cheap, don't use
   #1 just to get a number.
2. **Notification dropdown/panel** — #1 with a reasonable `limit` (e.g. 10–20), each row
   rendering `title`/`message` directly, colored by `severity`, clicking it calls #4
   (mark read) then navigates using `resource.model` + `resource.id`.
3. **"Mark all read" button** — #5, at the top of the panel.
4. **Full notifications page (optional)** — #1 with the `type`/`severity`/`isRead`
   filters as a dedicated inbox view, rather than just the dropdown preview.
5. **Per-type icons** — map the six `type` values to distinct icons (warning triangle
   for `attendance-warning`, currency icon for `late-payment`, book for `new-homework`,
   calendar for `upcoming-exam`, person for `pending-student-approval`, clipboard for
   `pending-attendance-approval`) — makes the feed scannable at a glance.

**Build this now, even before Finance** — you'll immediately see real notifications
from all the testing you've already done in Attendance/Grades/Payments, which makes
this an easy module to verify against real data with zero extra setup.

---

## Suggested API client

```js
// notifications.api.js
const BASE = '/notifications';
const qs = (params) => new URLSearchParams(params).toString();

export const listNotifications = (params) => apiFetch(`${BASE}?${qs(params)}`);

export const getNotificationSummary = () => apiFetch(`${BASE}/summary`);

export const getNotification = (id) => apiFetch(`${BASE}/${id}`);

export const markNotificationRead = (id) =>
  apiFetch(`${BASE}/${id}/read`, { method: 'PATCH' });

export const markAllNotificationsRead = () =>
  apiFetch(`${BASE}/read-all`, { method: 'PATCH' });

export const deleteNotification = (id) =>
  apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
```

---

## Polling strategy

There's no push/websocket layer — this is pull-only, same as the Dashboard module.

| Data | Suggested refresh |
|---|---|
| Unread summary (#2) | light polling, e.g. every 30–60s, or on window focus |
| Full list (#1) | on opening the notification panel; no need to poll while closed |

Keep the polling interval on #2 modest — it's cheap, but there's no reason to hit it
every few seconds either.

---

## Error handling checklist

| Status | `error.code` | Meaning here | UI response |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | not logged in / expired | handled by your shared Auth interceptor |
| 404 | `NOT_FOUND` | bad `{id}`, or it belongs to someone else | remove it from local state, treat as already gone |
| 422 | `UNPROCESSABLE_ENTITY` | bad query param value | shouldn't happen if you use the enum values above |

Nothing in this module has a 400/403/409 path — there's no ownership transfer, no
role restriction, and no conflicting-state operation here, which is part of why it's a
fast module to build.

---

*Previous: [`07-payments.md`](./07-payments.md). Next up: **Finance** (Revenue & Expense
ledgers + combined summary) — the natural continuation since Payments already writes
into it.*
