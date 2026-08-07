# Frontend Integration — Attendance Module

> Build order so far: **Auth → Students → Dashboard → Collections → Attendance (this doc).**
> Requires Collections + enrolment to already work — every attendance record needs an
> enrolled student in a real collection.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` on everything below.

---

## The workflow, in one picture

```
Student submits attendance          Instructor records directly
  POST /attendance/submit             POST /attendance  (or /attendance/bulk)
  → status: "pending"                 → status: present/absent immediately
        │                                    │
        ▼                                    │
Instructor reviews the queue                 │
  GET /attendance/pending                    │
  PATCH /attendance/{id}/review               │
  → status: present | absent ─────────────────┘
        │
        ▼
Student's cached attendancePercentage recalculates automatically
  (present ÷ (present + absent) — pending records don't count either way)
        │
        ▼
If it drops below the threshold (default 50%) →
  a warning notification is generated automatically
  (to the student AND every instructor — see the Notifications doc)
```

Two ways attendance gets recorded — **you likely need both**: self-service submission
for students, and direct/bulk recording for an instructor taking attendance in class.

**Role split:**
| Action | instructor | student |
|---|---|---|
| Submit your own attendance | ❌ | ✅ |
| Record/review/amend/delete any record | ✅ | ❌ |
| View your own attendance & summary | — | ✅ |
| View any student's attendance & summary | ✅ | ❌ (only their own) |

---

## Contents

- [Endpoint reference](#endpoint-reference)
  1. [Submit your own attendance (student)](#1-submit-your-own-attendance-student)
  2. [Your own attendance list (student)](#2-your-own-attendance-list-student)
  3. [Attendance summary](#3-attendance-summary)
  4. [Record a final status directly (instructor)](#4-record-a-final-status-directly-instructor)
  5. [Bulk-record a whole class](#5-bulk-record-a-whole-class)
  6. [Pending review queue (instructor)](#6-pending-review-queue-instructor)
  7. [Review a submission (instructor)](#7-review-a-submission-instructor)
  8. [List attendance records (instructor)](#8-list-attendance-records-instructor)
  9. [Today's summary across all collections](#9-todays-summary-across-all-collections)
  10. [One collection, one day (day sheet)](#10-one-collection-one-day-day-sheet)
  11. [Get / amend / delete one record (instructor)](#11-get--amend--delete-one-record-instructor)
  12. [Recalculate statistics (maintenance)](#12-recalculate-statistics-maintenance)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [The low-attendance warning rule](#the-low-attendance-warning-rule)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Error handling checklist](#error-handling-checklist)

---

## Endpoint reference

### 1. Submit your own attendance (student)
`POST /attendance/submit` — **student only**

```json
{ "collectionId": "6a74d01c227980ef471108da", "date": "2026-08-06", "notes": "" }
```
`date` optional (defaults to today, UTC). `notes` optional, ≤500 chars. One submission
per student/collection/day — a second submit for the same day is a `409`.

**Response `201`:**
```json
{
  "success": true,
  "message": "Attendance submitted successfully and is awaiting instructor review",
  "data": {
    "id": "6a74d2c1227980ef47110a2b",
    "student": "6a6d3bb92b51705e3108abe0",
    "collectionId": "6a74d01c227980ef471108da",
    "date": "2026-08-06T00:00:00.000Z",
    "status": "pending",
    "submittedBy": "6a6d3bb92b51705e3108abd4",
    "submittedAt": "2026-08-06T18:30:25.159Z",
    "reviewedBy": null,
    "reviewedAt": null,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
This is a real `pending` record now sitting in the instructor's review queue (#6).

**Errors:**
- `400` — student not enrolled in that collection
- `409` — already submitted for that day:
  ```json
  { "success": false, "message": "Attendance for this day has already been recorded (status: present)", "error": { "code": "CONFLICT", "statusCode": 409 } }
  ```
  The message tells you the current status — show it directly rather than a generic error.

---

### 2. Your own attendance list (student)
`GET /attendance/me` — **student only**

| Query param | Notes |
|---|---|
| `page`, `limit` | |
| `collection` | filter to one collection |
| `status` | `pending` \| `present` \| `absent` |

**Response `200`** — real payload, `student`/`collectionId` are populated here:
```json
{
  "success": true,
  "message": "Your attendance records retrieved successfully",
  "data": [
    {
      "id": "6a74d2c1227980ef47110a2b",
      "student": { "id": "6a6d...", "fullName": "Yara Hassan", "email": "yara@example.com", "educationLevel": "secondary-2" },
      "collectionId": { "id": "6a74...", "name": "Web", "subject": "Web Development" },
      "date": "2026-08-06T00:00:00.000Z",
      "status": "present",
      "submittedBy": "6a6d...",
      "submittedAt": "...",
      "reviewedBy": "6a6d...",
      "reviewedAt": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "pagination": { "total": 2, "count": 2, "page": 1, "limit": 20, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false } },
  "timestamp": "..."
}
```

---

### 3. Attendance summary
`GET /attendance/summary`

Instructors can pass `?student=` for anyone; if omitted (or you're a student), you get
your own. **A student can never see anyone else's summary** — passing another student's
id is silently ignored for a student caller (they always get their own).

| Query param | Who | Notes |
|---|---|---|
| `student` | instructor only | which student |
| `collection` | both | narrow to one collection |

**Response `200`** — real payload (this student is below the threshold):
```json
{
  "success": true,
  "message": "Attendance summary retrieved successfully",
  "data": {
    "totalPresent": 1,
    "totalAbsent": 2,
    "totalPending": 0,
    "totalSessions": 3,
    "attendancePercentage": 33.33,
    "threshold": 50,
    "hasWarning": true
  },
  "timestamp": "..."
}
```
- `attendancePercentage` = `totalPresent ÷ totalSessions × 100`, where
  `totalSessions = totalPresent + totalAbsent` — **pending records are excluded** from
  both the numerator and denominator, so an unreviewed submission never hurts (or helps)
  the percentage.
- `hasWarning` is the exact same rule the server uses to decide whether to fire a
  notification — bind your "⚠️ below required attendance" banner directly to this field.

This is the single most important call for both the student's own dashboard tile and
an instructor's per-student detail view.

---

### 4. Record a final status directly (instructor)
`POST /attendance` — **instructor only**

For an instructor taking attendance themselves — skips the pending step entirely.
**Idempotent**: calling it again for the same student/collection/day overwrites the
existing record rather than erroring.

```json
{
  "student": "6a6d3bb92b51705e3108abee",
  "collectionId": "6a74d01c227980ef471108da",
  "date": "2026-08-01",
  "status": "present",
  "notes": ""
}
```
`status` must be `present` or `absent` (not `pending` — you can't manually create a
pending record, only a student's submit does that). `date` optional, defaults to today.

**Response `201`:**
```json
{
  "success": true,
  "message": "Attendance recorded successfully",
  "data": {
    "id": "6a74d20bc1a2f11ce2ef0205",
    "date": "2026-08-01T00:00:00.000Z",
    "collectionId": "6a74d01c227980ef471108da",
    "student": "6a6d3bb92b51705e3108abee",
    "status": "present",
    "submittedAt": null,
    "submittedBy": null,
    "reviewedAt": "...",
    "reviewedBy": "6a6d3bb82b51705e3108abaa",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
**Errors:** `400` — student not enrolled in that collection.

---

### 5. Bulk-record a whole class
`POST /attendance/bulk` — **instructor only**

The "take attendance for today's class" screen — one call for the whole roster.

```json
{
  "collectionId": "6a74d01c227980ef471108da",
  "date": "2026-08-04",
  "records": [
    { "student": "6a6d3bb92b51705e3108abee", "status": "present" },
    { "student": "6a6d3bb92b51705e3108abe0", "status": "present" },
    { "student": "665f...someone-not-enrolled", "status": "absent" }
  ]
}
```

**Response `201`** — **partial success**, always check both arrays:
```json
{
  "success": true,
  "message": "2 record(s) saved, 0 skipped",
  "data": {
    "date": "2026-08-04T00:00:00.000Z",
    "recorded": [
      { "student": "6a6d3bb92b51705e3108abee", "status": "present" },
      { "student": "6a6d3bb92b51705e3108abe0", "status": "present" }
    ],
    "skipped": []
  },
  "timestamp": "..."
}
```
A student not enrolled in the collection appears in `skipped` with
`"reason": "Not enrolled in this collection"` — the other rows still save. This is the
one call where the message string (`"2 record(s) saved, 0 skipped"`) is genuinely useful
to show as-is in a toast.

---

### 6. Pending review queue (instructor)
`GET /attendance/pending` — **instructor only**

| Query param | Notes |
|---|---|
| `page`, `limit` | |

**Response `200`:** same record shape as #2, filtered to `status: "pending"`. This is
your "Attendance Awaiting Review" screen — every row needs a **Present**/**Absent**
button pair that calls #7.

---

### 7. Review a submission (instructor)
`PATCH /attendance/{id}/review` — **instructor only**

```json
{ "status": "present", "notes": "" }
```
`status` must be `present` or `absent`. Only works on a record still in `pending` — a
second review attempt is a `409`.

**Response `200`:**
```json
{
  "success": true,
  "message": "Attendance marked as present",
  "data": {
    "id": "6a74d2c1227980ef47110a2b",
    "student": "6a6d3bb92b51705e3108abe0",
    "collectionId": "6a74d01c227980ef471108da",
    "date": "2026-08-06T00:00:00.000Z",
    "status": "present",
    "submittedBy": "6a6d...",
    "submittedAt": "...",
    "reviewedBy": "6a6d3bb82b51705e3108abaa",
    "reviewedAt": "...",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
**Errors:** `409` if already reviewed — remove the row from your local queue state
immediately on success so a double-click can't trigger this.

---

### 8. List attendance records (instructor)
`GET /attendance` — **instructor only**

The general-purpose query endpoint — use this for a "full history" or "audit" view,
filterable any way you like.

| Query param | Notes |
|---|---|
| `page`, `limit`, `sort` | e.g. `?sort=-date` |
| `student` | |
| `collection` | |
| `status` | `pending` \| `present` \| `absent` |
| `date` | exact day match, or range: `?date[gte]=2026-08-01&date[lte]=2026-08-31` |

**Response `200`** — real payload, both `student` and `collectionId` populated:
```json
{
  "success": true,
  "message": "Attendance records retrieved successfully",
  "data": [
    {
      "id": "6a74d28cc1a2f11ce2ef020a",
      "student": { "id": "6a6d...", "fullName": "Mostafa Ali", "email": "mostafa@example.com", "educationLevel": "preparatory-3" },
      "collectionId": { "id": "6a74...", "name": "Web", "subject": "Web Development" },
      "date": "2026-08-04T00:00:00.000Z",
      "status": "present",
      "submittedAt": null,
      "submittedBy": null,
      "reviewedAt": "...",
      "reviewedBy": "6a6d...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "pagination": { "total": 5, "count": 20, "page": 1, "limit": 20, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false } },
  "timestamp": "..."
}
```

---

### 9. Today's summary across all collections
`GET /attendance/today` — **instructor only**, no params

**Response `200`:**
```json
{
  "success": true,
  "message": "Today's attendance summary retrieved successfully",
  "data": { "pending": 3, "present": 42, "absent": 5, "total": 50, "attendancePercentage": 89.36 }
}
```
`attendancePercentage` here excludes `pending` the same way #3 does. Feed this straight
into the dashboard's "today" tile (it's the same data `GET /dashboard` surfaces under
`attendance.today`).

---

### 10. One collection, one day (day sheet)
`GET /attendance/collection/{collectionId}` — **instructor only**

| Query param | Notes |
|---|---|
| `date` | defaults to today |

**Response `200`** — real payload:
```json
{
  "success": true,
  "message": "Collection attendance retrieved successfully",
  "data": {
    "date": "2026-08-04T00:00:00.000Z",
    "counts": { "pending": 0, "present": 2, "absent": 0 },
    "records": [
      { "id": "...", "student": { "id": "...", "fullName": "Mostafa Ali", "email": "..." }, "collectionId": "6a74...", "date": "...", "status": "present", "...": "..." }
    ]
  },
  "timestamp": "..."
}
```
This is the "take attendance" screen's read side — load this first to see who's already
marked, then use #5 (bulk) to fill in the rest, or #4 per-student for one-off corrections.
Note `records` here only includes students **already recorded** that day — cross-reference
against the full roster (`GET /collections/{id}/students` from the Collections doc) to
know who's missing.

---

### 11. Get / amend / delete one record (instructor)
`GET /attendance/{id}` · `PATCH /attendance/{id}` · `DELETE /attendance/{id}` — **instructor only**

**PATCH body** (both optional, at least one required):
```json
{ "status": "absent", "notes": "Called in sick, note from parent" }
```
Real response after amending notes on an already-`present` record:
```json
{
  "success": true,
  "message": "Attendance record updated successfully",
  "data": {
    "id": "6a74d2c1227980ef47110a2b",
    "status": "present",
    "notes": "Called in sick, note from parent",
    "reviewedAt": "...",
    "...": "..."
  },
  "timestamp": "..."
}
```
Changing `status` here recalculates the student's cached percentage (same as a review);
changing only `notes` does not.

**DELETE response:** `{ "data": { "id": "..." } }` — also triggers a recalculation for
that student, since removing a record changes their totals.

---

### 12. Recalculate statistics (maintenance)
`POST /attendance/recalculate` — **instructor only**, no body

Recomputes every student's cached `attendancePercentage`/`totalPresent`/`totalAbsent`
from scratch. You almost never need this from the UI — it exists for after a bulk data
import or manual database fix. If you build a button for it, put it in a "Settings" or
"Maintenance" area, not the main attendance flow.

**Response `200`:**
```json
{ "success": true, "message": "Attendance statistics recalculated successfully", "data": { "studentsProcessed": 132 } }
```

---

## Quick reference table

| # | Action | Method & URL | Who |
|---|---|---|---|
| 1 | Submit own attendance | `POST /attendance/submit` | student |
| 2 | Own attendance list | `GET /attendance/me` | student |
| 3 | Summary (+ warning flag) | `GET /attendance/summary` | both (scoped) |
| 4 | Record directly | `POST /attendance` | instructor |
| 5 | Bulk-record a class | `POST /attendance/bulk` | instructor |
| 6 | Pending review queue | `GET /attendance/pending` | instructor |
| 7 | Review a submission | `PATCH /attendance/{id}/review` | instructor |
| 8 | List (full query) | `GET /attendance` | instructor |
| 9 | Today, all collections | `GET /attendance/today` | instructor |
| 10 | One collection, one day | `GET /attendance/collection/{collectionId}` | instructor |
| 11 | Get / amend / delete | `GET`/`PATCH`/`DELETE /attendance/{id}` | instructor |
| 12 | Recalculate (maintenance) | `POST /attendance/recalculate` | instructor |

---

## Data shapes

**`status`** — `"pending"` \| `"present"` \| `"absent"`

**Full attendance record:**
```ts
{
  id: string
  student: string | { id, fullName, email, educationLevel }   // populated on most GETs
  collectionId: string | { id, name, subject }                 // populated on most GETs
  date: string           // ISO date, always midnight UTC
  status: "pending" | "present" | "absent"
  submittedBy: string | null    // set only when a student self-submitted
  submittedAt: string | null
  reviewedBy: string | null     // set once an instructor reviews/records it
  reviewedAt: string | null
  notes?: string
  createdAt: string
  updatedAt: string
}
```

**Summary object** (from #3):
```ts
{
  totalPresent: number
  totalAbsent: number
  totalPending: number
  totalSessions: number         // totalPresent + totalAbsent (pending excluded)
  attendancePercentage: number  // 0–100, 2 decimal places
  threshold: number             // the configured warning threshold, default 50
  hasWarning: boolean
}
```

---

## The low-attendance warning rule

Worth understanding since it drives UI you'll want to build around it:

> **Whenever a record changes a student's present/absent totals** (recorded, bulk-recorded,
> reviewed, amended, or deleted), the server recalculates that student's cached
> `attendancePercentage`. If it's below the configured threshold (default 50%) **and**
> the student has at least one counted session, a warning notification is generated —
> sent to **both** the student and **every instructor** — automatically, server-side.
> You don't call anything extra for this to happen; it's a side effect of #4/#5/#7/#11.

This is why `hasWarning` in the summary (#3) is trustworthy as a UI flag — it's
literally the same condition the notification system uses. See the Notifications doc
(not yet written) for how to surface these once generated; for now, `GET
/notifications?type=attendance-warning` will list them if you want to build that early.

---

## Frontend build plan

Two related but distinct screens — build in this order:

1. **"Take attendance" screen (instructor)** — pick a collection + date, load #10 to see
   what's already recorded, show the full roster (from Collections doc) with a
   present/absent toggle per row, submit everything via #5 (bulk). This is the daily-use
   screen; get this right first.
2. **Pending review queue (instructor)** — #6 as a list, Present/Absent buttons per row
   calling #7. Pairs naturally with the dashboard's `attendance.pendingApprovals` tile
   and `action-items.pendingAttendanceApprovals` — link from there.
3. **Student "mark my attendance" screen** — a simple button calling #1 for today (or a
   date picker if you allow backdated submission), with a "waiting for review" state
   once submitted (poll #2 or just show the pending record you already have).
4. **Per-student attendance detail** — #3 (summary) as headline stats + #8 filtered by
   `student=` as the history table. Use this both on the instructor's student-detail
   page (Students module) and the student's own profile page.
5. **History/audit view (optional)** — #8 with the date-range operators, for an
   instructor who wants to browse everything.

**Skip building a UI for #12** (recalculate) initially — it's a maintenance escape
hatch, not a feature.

---

## Suggested API client

```js
// attendance.api.js
const BASE = '/attendance';
const qs = (params) => new URLSearchParams(params).toString();

// student
export const submitAttendance = (collectionId, date, notes) =>
  apiFetch(`${BASE}/submit`, {
    method: 'POST',
    body: JSON.stringify({ collectionId, date, notes }),
  });

export const listMyAttendance = (params) => apiFetch(`${BASE}/me?${qs(params)}`);

// shared
export const getAttendanceSummary = (params) => apiFetch(`${BASE}/summary?${qs(params)}`);

// instructor
export const recordAttendance = (payload) =>
  apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });

export const recordAttendanceBulk = (collectionId, date, records) =>
  apiFetch(`${BASE}/bulk`, {
    method: 'POST',
    body: JSON.stringify({ collectionId, date, records }),
  });

export const listPendingAttendance = (params) => apiFetch(`${BASE}/pending?${qs(params)}`);

export const reviewAttendance = (id, status, notes) =>
  apiFetch(`${BASE}/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, notes }) });

export const listAttendance = (params) => apiFetch(`${BASE}?${qs(params)}`);

export const getTodaySummary = () => apiFetch(`${BASE}/today`);

export const getCollectionDay = (collectionId, date) =>
  apiFetch(`${BASE}/collection/${collectionId}?${qs({ date })}`);

export const getAttendanceRecord = (id) => apiFetch(`${BASE}/${id}`);

export const updateAttendance = (id, payload) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteAttendance = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
```

---

## Error handling checklist

| Status | `error.code` (examples) | Meaning here | UI response |
|---|---|---|---|
| 400 | `BAD_REQUEST` | student not enrolled in the collection | inline message, or filter the student picker to enrolled students only so this can't happen |
| 403 | `INSUFFICIENT_ROLE` | student hit an instructor-only endpoint, or requested another student's summary | hide the control entirely for student accounts |
| 404 | `NOT_FOUND` | bad `{id}` | remove the row / redirect |
| 409 | `CONFLICT` | already submitted for the day (#1), or already reviewed (#7) | show the message directly — both are already user-facing text; refresh the local list to reflect reality |
| 422 | `UNPROCESSABLE_ENTITY` | bad `status` value, bad date, etc. | map `error.details[].field` to form fields |

---

*Previous: [`04-collections.md`](./04-collections.md). Next up: **Grades** or
**Payments** — both are independent of Attendance and of each other, build whichever
matters more to you.*
