# Frontend Integration — Collections Module

> Build order so far: **Auth → Students → Dashboard → Collections (this doc).**
> This doc covers two things together because they're one screen set in practice:
> **Collections** (teaching groups) and **Collection Students** (enrolment into them).

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` on everything below.

**Role split for this module:**
| Action | instructor | student |
|---|---|---|
| Create / update / delete a collection | ✅ | ❌ |
| List / view collections | ✅ (sees all) | ✅ (sees only their own) |
| Manage enrolment (add/remove students) | ✅ | ❌ |
| View the roster inside a collection | ✅ (any) | ✅ (only if enrolled in it) |

A student calling any collection endpoint automatically only ever sees collections
they're enrolled in — the API scopes this server-side, you don't need to filter
client-side, but you should still hide the "create/edit" UI for student accounts.

---

## Contents

- [Part A — Collections](#part-a--collections)
  1. [Create a collection](#1-create-a-collection)
  2. [List collections](#2-list-collections)
  3. [Distinct subjects](#3-distinct-subjects)
  4. [Get one collection](#4-get-one-collection)
  5. [Update a collection](#5-update-a-collection)
  6. [Delete a collection](#6-delete-a-collection)
  7. [Restore a deleted collection](#7-restore-a-deleted-collection)
- [Part B — Collection Students (enrolment)](#part-b--collection-students-enrolment)
  8. [Enrol one or many students](#8-enrol-one-or-many-students)
  9. [List students in a collection](#9-list-students-in-a-collection)
  10. [List raw enrolment records](#10-list-raw-enrolment-records)
  11. [Remove a student from a collection](#11-remove-a-student-from-a-collection)
  12. [Suspend/reactivate an enrolment](#12-suspendreactivate-an-enrolment)
  13. [List a student's collections](#13-list-a-students-collections)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Error handling checklist](#error-handling-checklist)

---

## Part A — Collections

### 1. Create a collection
`POST /collections` — **instructor only**

**Request body:**
```json
{
  "name": "Physics — Grade 11 (Saturday group)",
  "subject": "Physics",
  "educationLevel": "secondary-2",
  "pricePerClass": 150,
  "monthlySubscriptionPrice": 500,
  "capacity": 25,
  "description": "Mechanics and thermodynamics, following the national curriculum.",
  "isActive": true,
  "schedule": [
    { "day": "saturday", "startTime": "16:00", "endTime": "18:00", "room": "A1" }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | 2–150 chars |
| `subject` | ✅ | 2–100 chars |
| `educationLevel` | ✅ | see [enums](#data-shapes) |
| `pricePerClass` | ❌ | number ≥ 0, default `0` |
| `monthlySubscriptionPrice` | ❌ | number ≥ 0, default `0` |
| `capacity` | ❌ | integer 1–1000, `null` = unlimited |
| `description` | ❌ | up to 3000 chars |
| `isActive` | ❌ | default `true` |
| `schedule` | ❌ | array of slots, max 14, default `[]` — see below |

**Schedule slot shape:**
```json
{ "day": "saturday", "startTime": "16:00", "endTime": "18:00", "room": "A1" }
```
- `day`: `sunday`\|`monday`\|`tuesday`\|`wednesday`\|`thursday`\|`friday`\|`saturday`
- `startTime` / `endTime`: `"HH:mm"` 24-hour, `endTime` must be later than `startTime`
- `room`: optional, free text
- Slots **cannot overlap on the same day** within one collection — validated server-side.

**Response `201`:**
```json
{
  "success": true,
  "message": "Collection created successfully",
  "data": {
    "id": "6a6d3bb82b51705e3108abba",
    "name": "Physics — Grade 11 (Saturday group)",
    "subject": "Physics",
    "educationLevel": "secondary-2",
    "pricePerClass": 150,
    "monthlySubscriptionPrice": 500,
    "schedule": [{ "day": "saturday", "startTime": "16:00", "endTime": "18:00", "room": "A1" }],
    "description": "Mechanics and thermodynamics, following the national curriculum.",
    "capacity": 25,
    "isActive": true,
    "studentsCount": 0,
    "createdBy": "6a6d3bb82b51705e3108abaa",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
`createdBy` is a bare id string on create/update/list, but **populated to
`{id, fullName, email}`** on the single-item detail endpoint (#4) — see the note there.

**Errors:**
- `409` — a collection with the same `name` + `subject` + `educationLevel` already exists
- `400` — two schedule slots overlap on the same day
- `422` — validation

---

### 2. List collections
`GET /collections`

| Query param | Example | Notes |
|---|---|---|
| `page`, `limit` | `?page=1&limit=20` | limit capped at 100 |
| `sort` | `?sort=name` or `?sort=-studentsCount` | |
| `search` | `?search=physics` | matches name / subject / description |
| `subject` | `?subject=Physics` | |
| `educationLevel` | `?educationLevel=secondary-2` | |
| `isActive` | `?isActive=true` | |

**Response `200`** — real payload, note `createdBy` is a **bare id string** here, not populated:
```json
{
  "success": true,
  "message": "Collections retrieved successfully",
  "data": [
    {
      "id": "6a6d3bb82b51705e3108abba",
      "name": "Physics — Grade 11 (Saturday group)",
      "subject": "Physics",
      "educationLevel": "secondary-2",
      "pricePerClass": 150,
      "monthlySubscriptionPrice": 500,
      "schedule": [{ "day": "saturday", "startTime": "16:00", "endTime": "18:00", "room": "A1" }],
      "description": "Mechanics and thermodynamics, following the national curriculum.",
      "capacity": 25,
      "isActive": true,
      "studentsCount": 4,
      "createdBy": "6a6d3bb82b51705e3108abaa",
      "createdAt": "2026-08-01T00:20:08.814Z",
      "updatedAt": "2026-08-04T08:44:17.283Z"
    }
  ],
  "meta": { "pagination": { "total": 9, "count": 20, "page": 1, "limit": 20, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false } },
  "timestamp": "..."
}
```
**As a student**, this same endpoint returns only the collections they're enrolled in — no
extra query param needed, the scoping is automatic.

---

### 3. Distinct subjects
`GET /collections/subjects`

Every distinct subject currently in use — for populating a filter dropdown.

**Response `200`:**
```json
{ "success": true, "message": "Subjects retrieved successfully", "data": ["Mathematics", "Physics"], "timestamp": "..." }
```

---

### 4. Get one collection
`GET /collections/{id}`

Instructor may fetch any collection. A student may only fetch one they're enrolled
in — `403` otherwise.

**Response `200`** — note `createdBy` **is populated here** (unlike the list endpoint):
```json
{
  "success": true,
  "message": "Collection retrieved successfully",
  "data": {
    "id": "6a6d3bb82b51705e3108abba",
    "name": "Physics — Grade 11 (Saturday group)",
    "subject": "Physics",
    "educationLevel": "secondary-2",
    "pricePerClass": 150,
    "monthlySubscriptionPrice": 500,
    "schedule": [{ "day": "saturday", "startTime": "16:00", "endTime": "18:00", "room": "A1" }],
    "description": "Mechanics and thermodynamics, following the national curriculum.",
    "capacity": 25,
    "isActive": true,
    "studentsCount": 4,
    "createdBy": { "id": "6a6d3bb82b51705e3108abaa", "fullName": "Head Instructor", "email": "instructor@edu-system.local" },
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
`studentsCount` is self-healing — the server re-verifies it against the actual enrolment
records on every call to this endpoint, so you never need to worry about it drifting.

**Errors:** `403` (student, not enrolled) · `404`.

---

### 5. Update a collection
`PATCH /collections/{id}` — **instructor only**

Same field set as create, all optional — send only what changed:
```json
{ "description": "Updated syllabus notes.", "capacity": 30 }
```

**Response `200`:** updated collection object (same shape as #1).

**Errors:**
- `400` — new `capacity` is lower than the current `studentsCount` (can't shrink below the current roster)
- `400` — new `schedule` has overlapping slots
- `404`

---

### 6. Delete a collection
`DELETE /collections/{id}` — **instructor only**

Soft-delete. **Detaches every enrolled student** (they stop seeing this collection), but
lesson/homework/attachment records tied to it are retained and reachable again if restored.

**Response `200`:**
```json
{ "success": true, "message": "Collection deleted successfully", "data": { "id": "6a6d3bb8..." }, "timestamp": "..." }
```

---

### 7. Restore a deleted collection
`PATCH /collections/{id}/restore` — **instructor only**, no body

**Response `200`:** the restored collection object. `404` if it was never deleted.

---

## Part B — Collection Students (enrolment)

All nested under `/collections/{collectionId}/students`.

### 8. Enrol one or many students
`POST /collections/{collectionId}/students` — **instructor only**

Two modes — **single** or **batch** — pick one, don't send both:

```json
{ "student": "665f1c2e9b1e8a0012ab34cd" }
```
or
```json
{ "students": ["665f...a1", "665f...a2", "665f...a3"] }
```
`notes` (optional, ≤500 chars) may accompany the single-student form.

Only **approved (`active`) students** may be enrolled; capacity is enforced if the
collection has one set.

**Response `201` (single):**
```json
{
  "success": true,
  "message": "Student enrolled successfully",
  "data": {
    "id": "6a71a661227980ef47110695",
    "collectionId": "6a6d3bb82b51705e3108abba",
    "student": "6a71a661227980ef47110692",
    "studentName": "Test WithCode",
    "isActive": true,
    "addedBy": "6a6d3bb82b51705e3108abaa",
    "enrolledAt": "..."
  },
  "timestamp": "..."
}
```

**Response `201` (batch)** — **partial success**, always inspect both arrays:
```json
{
  "success": true,
  "message": "2 student(s) enrolled, 1 skipped",
  "data": {
    "enrolled": [{ "student": "665f...a1", "enrolmentId": "665f...b1" }],
    "skipped": [{ "student": "665f...a3", "reason": "This student is already enrolled in this collection" }]
  },
  "timestamp": "..."
}
```
Common `reason` values: *"This student is already enrolled in this collection"*,
*"Only approved (active) students can be enrolled"*, *"This collection has reached its
capacity of N"*. Render these directly — they're already user-facing text.

**Errors (single mode):** `400` not active · `404` student/collection not found ·
`409` already enrolled/capacity reached.

---

### 9. List students in a collection
`GET /collections/{collectionId}/students`

Returns **full student profiles** (not just enrolment rows) — this is your roster view.

| Query param | Notes |
|---|---|
| `page`, `limit`, `sort`, `search` | search matches name/email/phone/school |
| `status` | `pending` \| `active` |
| `performance` | see [enums](#data-shapes) |
| `paymentStatus` | `pending` \| `paid` \| `late` |

**Response `200`** — real payload:
```json
{
  "success": true,
  "message": "Collection students retrieved successfully",
  "data": [
    {
      "id": "6a701e712722ce8fa41199c5",
      "fullName": "Nour Adel",
      "email": "nour.pending@example.com",
      "phone": "+201234500001",
      "parentPhone": "+201234500002",
      "educationLevel": "secondary-1",
      "school": "Test School",
      "profileImage": null,
      "status": "pending",
      "performance": "average",
      "attendancePercentage": 0,
      "totalPresent": 0,
      "totalAbsent": 0,
      "totalSessions": 0,
      "paymentStatus": "pending",
      "outstandingBalance": 0
    }
  ],
  "meta": { "pagination": { "total": 3, "count": 2, "page": 1, "limit": 2, "totalPages": 2, "hasPreviousPage": false, "hasNextPage": true } },
  "timestamp": "..."
}
```
This is the same student shape as the [Students module](./02-students.md) — reuse your
student-row component here. Note it **includes pending students** already enrolled
(e.g. via a collection-bound activation code) — you may want a visual indicator for
`status: "pending"` rows in this list.

As a student, this only works for collections you're enrolled in.

---

### 10. List raw enrolment records
`GET /collections/{collectionId}/students/enrolments` — **instructor only**

The join rows themselves (who added them, when, active flag) — rather than full
profiles. Useful for an audit/history view rather than the main roster.

**Response `200`** — real payload:
```json
{
  "success": true,
  "message": "Enrolments retrieved successfully",
  "data": [
    {
      "id": "6a71a661227980ef47110695",
      "collectionId": "6a6d3bb82b51705e3108abba",
      "student": "6a71a661227980ef47110692",
      "studentName": "Test WithCode",
      "isActive": true,
      "addedBy": "6a6d3bb82b51705e3108abaa",
      "enrolledAt": "2026-08-04T08:44:17.282Z",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "pagination": { "...": "..." } },
  "timestamp": "..."
}
```
Note `student` and `addedBy` are bare id strings here — not populated. For most UI you
want #9 instead; use this one only if you specifically need enrolment metadata (added-by,
enrolled-at) separate from the profile.

---

### 11. Remove a student from a collection
`DELETE /collections/{collectionId}/students/{studentId}` — **instructor only**

Unenrols the student. Attendance/grades/payments already recorded for this collection
are preserved.

**Response `200`:**
```json
{ "success": true, "message": "Student removed from collection successfully", "data": { "collection": "6a6d...", "student": "665f..." }, "timestamp": "..." }
```

---

### 12. Suspend/reactivate an enrolment
`PATCH /collections/{collectionId}/students/{studentId}/status` — **instructor only**

```json
{ "isActive": false }
```
Suspends the student *within this one collection* without fully unenrolling them — use
this for a temporary pause rather than #11's permanent removal.

**Response `200`:** the updated enrolment record.

---

### 13. List a student's collections
`GET /students/{studentId}/collections` — **instructor only**

Lives under the Students path, not Collections, but belongs here conceptually — the
inverse lookup ("what is this student enrolled in").

| Query param | Notes |
|---|---|
| `page`, `limit`, `search` | search matches name/subject/description |

**Response `200`:** paginated list of collection objects (same shape as #2).

---

## Quick reference table

| # | Action | Method & URL | Who |
|---|---|---|---|
| 1 | Create collection | `POST /collections` | instructor |
| 2 | List collections | `GET /collections` | both (scoped) |
| 3 | Distinct subjects | `GET /collections/subjects` | both |
| 4 | Get one | `GET /collections/{id}` | both (scoped) |
| 5 | Update | `PATCH /collections/{id}` | instructor |
| 6 | Delete | `DELETE /collections/{id}` | instructor |
| 7 | Restore | `PATCH /collections/{id}/restore` | instructor |
| 8 | Enrol (single/batch) | `POST /collections/{collectionId}/students` | instructor |
| 9 | List roster (full profiles) | `GET /collections/{collectionId}/students` | both (scoped) |
| 10 | List raw enrolments | `GET /collections/{collectionId}/students/enrolments` | instructor |
| 11 | Unenrol | `DELETE /collections/{collectionId}/students/{studentId}` | instructor |
| 12 | Suspend/reactivate | `PATCH /collections/{collectionId}/students/{studentId}/status` | instructor |
| 13 | Student's collections | `GET /students/{studentId}/collections` | instructor |

---

## Data shapes

**`educationLevel`** — same 14 values as the Students module:
```
primary-1, primary-2, primary-3, primary-4, primary-5, primary-6,
preparatory-1, preparatory-2, preparatory-3,
secondary-1, secondary-2, secondary-3,
university, other
```

**`WEEK_DAYS`** — `sunday, monday, tuesday, wednesday, thursday, friday, saturday`

**Full collection object:**
```ts
{
  id: string
  name: string
  subject: string
  educationLevel: string
  pricePerClass: number
  monthlySubscriptionPrice: number
  schedule: Array<{ day, startTime, endTime, room? }>
  description?: string
  capacity: number | null
  isActive: boolean
  studentsCount: number
  createdBy: string | { id, fullName, email }   // populated only on GET /collections/{id}
  createdAt: string
  updatedAt: string
}
```

**Enrolment record:**
```ts
{
  id: string
  collectionId: string
  student: string
  studentName: string       // denormalised at enrolment time
  isActive: boolean
  addedBy: string
  enrolledAt: string
  createdAt: string
  updatedAt: string
}
```

---

## Frontend build plan

1. **Collections list page** (#2) — cards or table, with subject/level filters fed by
   #3's dropdown. This is the new top-level nav item alongside Students.
2. **Create/edit collection form** (#1, #5) — the trickiest UI piece here is the
   **schedule builder**: a repeatable row of day/start/end/room, client-side validated
   for no same-day overlap before you even submit (mirror the server rule for instant
   feedback, but still handle the `400` if it slips through).
3. **Collection detail page** (#4) — header with the collection's info, then tabs or
   sections for:
   - **Roster tab** — #9, reusing your Students-module row component
   - **Enrol students** — a picker (search students by name/email) that calls #8 in
     single mode for one, or lets the user multi-select and calls #8 in batch mode
   - **Enrolment history tab** (optional) — #10, if you want an audit view
4. **Row actions on the roster** — unenrol (#11) and suspend/reactivate (#12) as a
   dropdown menu per row.
5. **Delete/restore** (#6, #7) at the collection level — same pattern as Students.
6. **Reverse lookup** — on the Student detail page (from the Students module), add a
   "Collections" section powered by #13, so instructors can see a student's enrolments
   without navigating away.

**Reuse tip:** the roster (#9) returns the exact same student shape as the Students
module's list endpoint — build one `<StudentRow>` component and use it in both places.

---

## Suggested API client

```js
// collections.api.js
const BASE = '/collections';

export const listCollections = (params) =>
  apiFetch(`${BASE}?${new URLSearchParams(params)}`);

export const getSubjects = () => apiFetch(`${BASE}/subjects`);

export const getCollection = (id) => apiFetch(`${BASE}/${id}`);

export const createCollection = (payload) =>
  apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });

export const updateCollection = (id, payload) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteCollection = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });

export const restoreCollection = (id) =>
  apiFetch(`${BASE}/${id}/restore`, { method: 'PATCH' });

// --- Enrolment ---

export const enrolStudent = (collectionId, studentId, notes) =>
  apiFetch(`${BASE}/${collectionId}/students`, {
    method: 'POST',
    body: JSON.stringify({ student: studentId, notes }),
  });

export const enrolStudents = (collectionId, studentIds) =>
  apiFetch(`${BASE}/${collectionId}/students`, {
    method: 'POST',
    body: JSON.stringify({ students: studentIds }),
  });

export const listRoster = (collectionId, params) =>
  apiFetch(`${BASE}/${collectionId}/students?${new URLSearchParams(params)}`);

export const listEnrolments = (collectionId, params) =>
  apiFetch(`${BASE}/${collectionId}/students/enrolments?${new URLSearchParams(params)}`);

export const unenrolStudent = (collectionId, studentId) =>
  apiFetch(`${BASE}/${collectionId}/students/${studentId}`, { method: 'DELETE' });

export const setEnrolmentActive = (collectionId, studentId, isActive) =>
  apiFetch(`${BASE}/${collectionId}/students/${studentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });

// lives under /students but belongs here conceptually
export const getStudentCollections = (studentId, params) =>
  apiFetch(`/students/${studentId}/collections?${new URLSearchParams(params)}`);
```

---

## Error handling checklist

| Status | `error.code` (examples) | Meaning here | UI response |
|---|---|---|---|
| 400 | `BAD_REQUEST` | overlapping schedule slots, capacity below current roster, student not active, not enrolled | inline message — most of these messages are already user-facing text |
| 403 | `INSUFFICIENT_ROLE` / `FORBIDDEN` | student action on an instructor-only endpoint, or viewing a collection they're not in | hide the button, or show "not available" |
| 404 | `NOT_FOUND` | bad `{id}`/`{collectionId}`/`{studentId}` | redirect to the list |
| 409 | `CONFLICT` | duplicate name+subject+level, already enrolled, capacity reached | inline near the offending field |
| 422 | `UNPROCESSABLE_ENTITY` | validation — check `error.details[].field` | map to form fields |

---

*Previous: [`03-dashboard.md`](./03-dashboard.md). Next up: pick a vertical —
**Attendance**, **Grades**, or **Payments** all build on Collections + enrolment, and
each is independent of the others, so build whichever matters most to you first.*
