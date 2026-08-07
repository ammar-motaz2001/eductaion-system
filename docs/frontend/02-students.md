# Frontend Integration — Students Module

> Build order: **Auth (done) → Students (this doc) → Collections → Dashboard → everything else.**
> This is the second screen set to build. It depends only on Auth (you need an
> `accessToken` and to know `user.role`).

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** every endpoint below requires `Authorization: Bearer <accessToken>` unless noted.
**Response envelope:** every response follows the same shape described in the Auth doc —
`{ success, message, data, meta?, timestamp }` for success, `{ success: false, message, error, timestamp }` for errors.

---

## Contents

- [Who can do what](#who-can-do-what)
- [Endpoint reference](#endpoint-reference)
  1. [Create a student](#1-create-a-student)
  2. [List students](#2-list-students)
  3. [Pending-approval queue](#3-pending-approval-queue)
  4. [Own profile (student)](#4-own-profile-student)
  5. [Get one student](#5-get-one-student)
  6. [Update a student](#6-update-a-student)
  7. [Delete a student](#7-delete-a-student)
  8. [Restore a deleted student](#8-restore-a-deleted-student)
  9. [Approve a pending student](#9-approve-a-pending-student)
  10. [Revoke approval](#10-revoke-approval)
  11. [Enable/disable login](#11-enabledisable-login)
  12. [Upload profile image](#12-upload-profile-image)
  13. [Add a note](#13-add-a-note)
  14. [Remove a note](#14-remove-a-note)
  15. [Set performance rating](#15-set-performance-rating)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Error handling checklist](#error-handling-checklist)

---

## Who can do what

| Role | Access |
|---|---|
| **instructor** | Everything — create, list, approve, edit, delete, upload photos, notes |
| **student** | `GET /students/me` and `GET /students/{ownId}` only — everything else returns `403` |

Enforce this in your router/guards too (don't rely on the API alone) — hide instructor-only
nav items from a logged-in student.

---

## Endpoint reference

### 1. Create a student
`POST /students` — **instructor only**

Instructor-direct creation, bypasses activation codes entirely. Account is created **already active**.

**Request body:**
```json
{
  "fullName": "Omar Khaled",
  "email": "omar@example.com",
  "phone": "+201234567890",
  "parentPhone": "+201234567891",
  "age": 17,
  "educationLevel": "secondary-2",
  "school": "Cairo Language School",
  "performance": "good",
  "address": { "city": "Giza", "governorate": "Giza", "country": "Egypt" },
  "collections": ["665f1c2e9b1e8a0012ab3400"]
}
```

| Field | Required | Notes |
|---|---|---|
| `fullName` | ✅ | letters, spaces, `'`, `-`, `.` only |
| `email` | ✅ | must be unique |
| `phone` | ✅ | E.164-ish, 7–15 digits |
| `parentPhone` | ✅ | same format |
| `educationLevel` | ✅ | see [enums](#data-shapes) |
| `password` | ❌ | **omit it** to auto-generate a strong temporary password |
| `age`, `school`, `address`, `performance` | ❌ | |
| `collections` | ❌ | array of collection ids to enrol into immediately (max 30) |

**Response `201`** — password omitted (show the credentials panel **once**, it's never returned again):
```json
{
  "success": true,
  "message": "Student created successfully. Share the temporary password shown here — it will not be retrievable again.",
  "data": {
    "student": {
      "id": "665f1c2e9b1e8a0012ab34cd",
      "fullName": "Omar Khaled",
      "email": "omar@example.com",
      "status": "active",
      "performance": "good",
      "attendancePercentage": 0,
      "paymentStatus": "pending",
      "collections": ["665f1c2e9b1e8a0012ab3400"],
      "createdAt": "..."
    },
    "credentials": { "email": "omar@example.com", "temporaryPassword": "aB3!k9Qz1x7P" }
  },
  "timestamp": "..."
}
```
If you **did** supply a `password`, `data.credentials` is `undefined` — check for its presence before rendering that panel.

**Errors:** `409` duplicate email · `422` validation (see [`error.details`](#error-handling-checklist)) · `400` a listed collection doesn't exist.

---

### 2. List students
`GET /students` — **instructor only**

| Query param | Example | Notes |
|---|---|---|
| `page`, `limit` | `?page=1&limit=20` | limit capped at 100 |
| `sort` | `?sort=-createdAt,fullName` | `-` prefix = descending |
| `search` | `?search=omar` | matches name / email / phone / school |
| `status` | `?status=active` | `pending` \| `active` |
| `educationLevel` | `?educationLevel=secondary-2` | |
| `performance` | `?performance=good` | |
| `paymentStatus` | `?paymentStatus=late` | |
| `collection` | `?collection=665f...` | only students enrolled in this collection |
| `school` | `?school=Cairo` | |
| `age`, `attendancePercentage` | `?attendancePercentage[lt]=50` | numeric fields support `[gte]`/`[lte]`/`[in]` |

**Response `200`:**
```json
{
  "success": true,
  "message": "Students retrieved successfully",
  "data": [
    { "id": "665f...", "fullName": "Omar Khaled", "status": "active", "educationLevel": "secondary-2" }
  ],
  "meta": {
    "pagination": {
      "total": 132, "count": 20, "page": 1, "limit": 20,
      "totalPages": 7, "hasPreviousPage": false, "hasNextPage": true
    }
  },
  "timestamp": "..."
}
```
Bind `meta.pagination` straight to your table's pager component.

---

### 3. Pending-approval queue
`GET /students/pending` — **instructor only**

Same shape as [List](#2-list-students), pre-filtered to `status: "pending"`. Params: `?page=`, `?limit=` only.
This is the data source for your "New Registrations" screen.

---

### 4. Own profile (student)
`GET /students/me` — **student only**

**Response `200`:**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "665f...",
    "fullName": "Yara Hassan",
    "status": "active",
    "collections": [
      { "id": "665f...", "name": "Physics — Grade 11", "subject": "Physics", "educationLevel": "secondary-2", "schedule": [] }
    ],
    "attendancePercentage": 82.4,
    "paymentStatus": "paid",
    "notes": [{ "id": "...", "body": "...", "createdBy": "...", "createdAt": "..." }]
  },
  "timestamp": "..."
}
```
This is the single data source for the student's own dashboard.

---

### 5. Get one student
`GET /students/{id}` — **both roles (scoped)**

Instructor can read any `{id}`. A student can only read **their own** id.

**Response `200`:** same shape as [`/students/me`](#4-own-profile-student), for the requested id.

**Errors:** `403` (student requesting someone else's id) · `404` not found · `422` if `{id}` isn't a valid 24-char ObjectId.

---

### 6. Update a student
`PATCH /students/{id}` — **instructor only**

Send only the fields you're changing (at least one required):
```json
{ "fullName": "Omar K.", "phone": "+201234567899", "performance": "very-good" }
```
Updatable: `fullName`, `age`, `phone`, `parentPhone`, `educationLevel`, `school`, `address`, `performance`.

**Not updatable here:**
- `email` — it's the login identifier
- `collections` — managed by the Collections module's enrolment endpoints (next doc), not here

**Response `200`:** the updated student object.
**Errors:** `422` empty body or invalid field · `404`.

---

### 7. Delete a student
`DELETE /students/{id}` — **instructor only**

Soft-delete. Cascades to the login account and enrolments. Grades/attendance/payment
history is **retained** for audit purposes.

**Response `200`:**
```json
{ "success": true, "message": "Student deleted successfully", "data": { "id": "665f..." }, "timestamp": "..." }
```

---

### 8. Restore a deleted student
`PATCH /students/{id}/restore` — **instructor only**, no body

**Response `200`:** the restored student object. `404` if it was never deleted.

---

### 9. Approve a pending student
`PATCH /students/{id}/approve` — **instructor only**, no body

The button on your pending-approval queue.

**Response `200`:** updated student, `status: "active"`.
**Errors:** `409` if already active.

---

### 10. Revoke approval
`PATCH /students/{id}/revoke-approval` — **instructor only**, no body

Puts an active student back to `pending` and force-logs-out every session they had.

**Response `200`:** updated student, `status: "pending"`.

---

### 11. Enable/disable login
`PATCH /students/{id}/account-status` — **instructor only**

```json
{ "isActive": false }
```
**Response `200`:**
```json
{ "success": true, "message": "Student account disabled", "data": { "id": "665f...", "isActive": false }, "timestamp": "..." }
```
A "suspend account" toggle — the student record stays intact, they just can't log in. Different from delete.

---

### 12. Upload profile image
`PATCH /students/{id}/profile-image` — **instructor only**

**Body:** `multipart/form-data`, field name **`image`** — JPEG/PNG/WebP/GIF/BMP/SVG, max 5 MB.

```js
const form = new FormData();
form.append('image', fileInput.files[0]);
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "id": "665f...",
    "profileImage": {
      "url": "/uploads/students/665f.../avatar-1722384000-ab12.png",
      "key": "students/665f.../avatar-1722384000-ab12.png",
      "provider": "local",
      "kind": "image"
    }
  },
  "timestamp": "..."
}
```

**To display it:**
- Authenticated: `GET /files/{key}` with the bearer header (works for any storage driver)
- Quick `<img>`: `http://localhost:5055/uploads/{key}` — unauthenticated, local storage only

**Errors:** `413` file too large · `415` unsupported file type.

---

### 13. Add a note
`POST /students/{id}/notes` — **instructor only**

```json
{ "body": "Improved noticeably in algebra this month." }
```
**Response `201`:** the full student object with the new note appended to `notes[]`.

### 14. Remove a note
`DELETE /students/{id}/notes/{noteId}` — **instructor only**

**Response `200`:** updated student object. `404` if `noteId` doesn't belong to that student.

---

### 15. Set performance rating
`PATCH /students/{id}/performance` — **instructor only**

```json
{ "performance": "excellent" }
```
**Response `200`:** updated student object.

---

## Quick reference table

| # | Action | Method & URL | Who |
|---|---|---|---|
| 1 | Create | `POST /students` | instructor |
| 2 | List | `GET /students` | instructor |
| 3 | Pending queue | `GET /students/pending` | instructor |
| 4 | Own profile | `GET /students/me` | student |
| 5 | Get one | `GET /students/{id}` | both (scoped) |
| 6 | Update | `PATCH /students/{id}` | instructor |
| 7 | Delete | `DELETE /students/{id}` | instructor |
| 8 | Restore | `PATCH /students/{id}/restore` | instructor |
| 9 | Approve | `PATCH /students/{id}/approve` | instructor |
| 10 | Revoke approval | `PATCH /students/{id}/revoke-approval` | instructor |
| 11 | Enable/disable login | `PATCH /students/{id}/account-status` | instructor |
| 12 | Upload photo | `PATCH /students/{id}/profile-image` | instructor |
| 13 | Add note | `POST /students/{id}/notes` | instructor |
| 14 | Remove note | `DELETE /students/{id}/notes/{noteId}` | instructor |
| 15 | Set performance | `PATCH /students/{id}/performance` | instructor |

---

## Data shapes

**`status`** — `"pending"` \| `"active"`

**`performance`** — `"excellent"` \| `"very-good"` \| `"good"` \| `"average"` \| `"weak"`

**`paymentStatus`** — `"pending"` \| `"paid"` \| `"late"` (read-only here — set by the Payments module)

**`educationLevel`** — one of:
```
primary-1, primary-2, primary-3, primary-4, primary-5, primary-6,
preparatory-1, preparatory-2, preparatory-3,
secondary-1, secondary-2, secondary-3,
university, other
```

**Full student object** (what you get back from #2, #4, #5, #6, #9, #10):
```ts
{
  id: string
  fullName: string
  email: string
  age?: number
  phone: string
  parentPhone: string
  educationLevel: string
  school?: string
  address?: { line?, city?, governorate?, country? }
  profileImage: { url, key, provider, kind } | null
  status: "pending" | "active"
  performance: "excellent" | "very-good" | "good" | "average" | "weak"
  notes: Array<{ id, body, createdBy, createdAt }>
  attendancePercentage: number
  totalPresent: number
  totalAbsent: number
  totalSessions: number
  paymentStatus: "pending" | "paid" | "late"
  outstandingBalance: number
  collections: string[] | Array<{ id, name, subject, educationLevel }>  // populated on #4/#5
  createdAt: string
  updatedAt: string
}
```

---

## Frontend build plan

Build in this order — each step is usable on its own before moving to the next:

1. **Students table** (#2) with search box + status/level filter dropdowns + pagination.
   This is your main nav hub going forward — build it solid.
2. **Pending queue** (#3) as a filtered view of the same table component, with an
   **Approve** button (#9) inline per row.
3. **Create student modal/page** (#1). Handle the two response shapes: if
   `data.credentials` is present, show a "copy password" dialog that won't reappear.
4. **Detail/edit page** (#5 + #6), with two sub-sections on the same page:
   - Notes list + add/remove (#13, #14)
   - Performance selector (#15)
5. **Row-level actions menu**: delete/restore (#7, #8), enable/disable login (#11),
   revoke approval (#10).
6. **Profile image** (#12) last — same upload widget pattern you'll reuse in every
   later module (lessons, homework, attachments, instructor settings).

**State management tip:** after any mutation (#1, #6, #7, #9, #10, #11, #13, #14, #15),
either refetch the list or optimistically patch the row in place — the response body
always contains the full updated object, so you don't need a second GET.

---

## Suggested API client

Drop-in fetch wrapper you can adapt (assumes a shared `apiFetch` that already attaches
the bearer token and handles the 401-refresh-retry loop from the Auth module):

```js
// students.api.js
const BASE = '/students';

export const listStudents = (params) =>
  apiFetch(`${BASE}?${new URLSearchParams(params)}`);

export const getPendingStudents = (params) =>
  apiFetch(`${BASE}/pending?${new URLSearchParams(params)}`);

export const getMyProfile = () => apiFetch(`${BASE}/me`);

export const getStudent = (id) => apiFetch(`${BASE}/${id}`);

export const createStudent = (payload) =>
  apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });

export const updateStudent = (id, payload) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteStudent = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });

export const restoreStudent = (id) => apiFetch(`${BASE}/${id}/restore`, { method: 'PATCH' });

export const approveStudent = (id) => apiFetch(`${BASE}/${id}/approve`, { method: 'PATCH' });

export const revokeApproval = (id) =>
  apiFetch(`${BASE}/${id}/revoke-approval`, { method: 'PATCH' });

export const setAccountActive = (id, isActive) =>
  apiFetch(`${BASE}/${id}/account-status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });

export const uploadProfileImage = (id, file) => {
  const form = new FormData();
  form.append('image', file);
  return apiFetch(`${BASE}/${id}/profile-image`, { method: 'PATCH', body: form });
};

export const addNote = (id, body) =>
  apiFetch(`${BASE}/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) });

export const removeNote = (id, noteId) =>
  apiFetch(`${BASE}/${id}/notes/${noteId}`, { method: 'DELETE' });

export const setPerformance = (id, performance) =>
  apiFetch(`${BASE}/${id}/performance`, {
    method: 'PATCH',
    body: JSON.stringify({ performance }),
  });
```

> **Note on `apiFetch` + FormData:** don't manually set `Content-Type` when the body is
> a `FormData` instance — let the browser set the multipart boundary. If your wrapper
> always sets `Content-Type: application/json`, special-case the upload calls.

---

## Error handling checklist

Every error response has this shape:
```json
{
  "success": false,
  "message": "Request validation failed",
  "error": {
    "code": "UNPROCESSABLE_ENTITY",
    "statusCode": 422,
    "details": [{ "field": "email", "message": "Must be a valid email address" }]
  },
  "timestamp": "..."
}
```

| Status | `error.code` (examples) | What it means here | UI response |
|---|---|---|---|
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` | not logged in / token expired | your Auth interceptor should already handle this (refresh-and-retry, or redirect to login) |
| 403 | `INSUFFICIENT_ROLE` | student hit an instructor-only endpoint, or requested another student's id | show "not allowed" / hide the button entirely if you knew the role in advance |
| 404 | `NOT_FOUND` | bad `{id}` | show "student not found", redirect to list |
| 409 | `CONFLICT` | duplicate email (#1) or already-active (#9) | inline message near the offending field |
| 422 | `UNPROCESSABLE_ENTITY` | validation failed | map `error.details[].field` → your form field names for inline errors |
| 413 | — | file too large (#12) | "Image must be under 5 MB" |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | wrong file type (#12) | "Please upload a JPEG, PNG, WebP, GIF, BMP or SVG" |

---

*Next up: **Collections** — teaching groups, schedules, and enrolling students into them.
That doc will follow this same structure at `docs/frontend/03-collections.md`.*
