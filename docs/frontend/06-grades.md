# Frontend Integration — Grades Module

> Build order so far: **Auth → Students → Dashboard → Collections → Attendance → Grades (this doc).**
> Requires Collections + enrolment — every grade needs an enrolled student in a real collection.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` on everything below.

**Role split:**
| Action | instructor | student |
|---|---|---|
| Add / update / delete grades | ✅ | ❌ |
| View own grades & summary | — | ✅ |
| View any student's grades & summary | ✅ | ❌ (only their own) |
| View class-wide summary | ✅ | ❌ |

---

## Contents

- [Endpoint reference](#endpoint-reference)
  1. [Add a grade](#1-add-a-grade)
  2. [Bulk-record one exam for many students](#2-bulk-record-one-exam-for-many-students)
  3. [List grades (instructor, full query)](#3-list-grades-instructor-full-query)
  4. [A student's grades](#4-a-students-grades)
  5. [Your own grades (student)](#5-your-own-grades-student)
  6. [Get / update / delete one grade](#6-get--update--delete-one-grade)
  7. [Grade summary for a student](#7-grade-summary-for-a-student)
  8. [Class-wide summary for a collection](#8-class-wide-summary-for-a-collection)
  9. [Exam types](#9-exam-types)
  10. [Upcoming exams](#10-upcoming-exams)
- [Quick reference table](#quick-reference-table)
- [Data shapes](#data-shapes)
- [How the average is calculated](#how-the-average-is-calculated)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API client](#suggested-api-client)
- [Error handling checklist](#error-handling-checklist)

---

## Endpoint reference

### 1. Add a grade
`POST /grades` — **instructor only**

```json
{
  "student": "6a6d3bb92b51705e3108abee",
  "collectionId": "6a74d01c227980ef471108da",
  "examType": "quiz",
  "title": "Quiz 1",
  "examDate": "2026-08-01",
  "score": 17,
  "totalScore": 20
}
```

| Field | Required | Notes |
|---|---|---|
| `student`, `collectionId` | ✅ | student must be enrolled in that collection |
| `examType` | ✅ | one of the [exam types](#9-exam-types) |
| `examDate` | ✅ | ISO date |
| `score` | ✅ | ≥ 0, **cannot exceed `totalScore`** |
| `totalScore` | ✅ | ≥ 1 |
| `title` | ❌ | free text, e.g. "Quiz 1" — falls back to the collection name if omitted |
| `homework` | ❌ | link this grade to a homework assignment id |
| `notes` | ❌ | ≤1000 chars |

**Response `201`** — real payload (note the derived `percentage` virtual field):
```json
{
  "success": true,
  "message": "Grade added successfully",
  "data": {
    "id": "6a74d4d4227980ef47110c00",
    "student": "6a6d3bb92b51705e3108abee",
    "collectionId": "6a74d01c227980ef471108da",
    "examType": "quiz",
    "title": "Quiz 1",
    "examDate": "2026-08-01T00:00:00.000Z",
    "score": 17,
    "totalScore": 20,
    "homework": null,
    "recordedBy": "6a6d3bb82b51705e3108abaa",
    "percentage": 85,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
If `examDate` is in the **future**, every student enrolled in the collection gets an
"upcoming exam" notification automatically — no extra call needed.

**Errors:**
- `400` — student not enrolled in that collection, or the referenced `homework` doesn't
  belong to the same collection
- `422` — `score > totalScore` is caught **at validation time** on create (see the
  [important note](#how-scoreexceeds-totalscore-is-reported) below)

---

### 2. Bulk-record one exam for many students
`POST /grades/bulk` — **instructor only**

The "enter the whole class's quiz scores" screen.

```json
{
  "collectionId": "6a74d01c227980ef471108da",
  "examType": "midterm",
  "examDate": "2026-08-05",
  "title": "Midterm",
  "totalScore": 50,
  "scores": [
    { "student": "6a6d3bb92b51705e3108abee", "score": 38 },
    { "student": "6a6d3bb92b51705e3108abe0", "score": 44 },
    { "student": "665f...not-enrolled", "score": 30 }
  ]
}
```
One shared `examType`/`examDate`/`title`/`totalScore` for the whole batch; only `score`
varies per student.

**Response `201`** — **partial success**, always check both arrays:
```json
{
  "success": true,
  "message": "2 grade(s) recorded, 0 skipped",
  "data": {
    "recorded": [
      { "student": "6a6d3bb92b51705e3108abee", "grade": "6a74d4d4227980ef47110c05" },
      { "student": "6a6d3bb92b51705e3108abe0", "grade": "6a74d4d4227980ef47110c07" }
    ],
    "skipped": []
  },
  "timestamp": "..."
}
```
A row is skipped with `"reason": "Not enrolled in this collection"` or
`"reason": "score exceeds totalScore"` — note this is the **one place** an out-of-range
score is silently skipped rather than rejecting the whole request; validate client-side
before submitting so nothing is silently dropped without the user noticing.

---

### 3. List grades (instructor, full query)
`GET /grades` — **instructor only**

| Query param | Notes |
|---|---|
| `page`, `limit`, `sort` | e.g. `?sort=-examDate` |
| `search` | matches `title` / `notes` |
| `student`, `collection` | |
| `examType` | supports set membership: `?examType[in]=quiz,midterm` |
| `examDate` | exact or range: `?examDate[gte]=2026-08-01` |
| `score` | range: `?score[gte]=15` |

**Response `200`:** array of grade objects (see [data shapes](#data-shapes)) +
standard `meta.pagination` — same envelope pattern as every other list endpoint.

---

### 4. A student's grades
`GET /grades/student/{studentId}` — **instructor** (any student) / **student** (only their own — `403` otherwise)

| Query param | Notes |
|---|---|
| `page`, `limit` | |
| `collection` | narrow to one collection |
| `examType` | |

**Response `200`** — real payload, note the `meta.summary` block riding along with pagination:
```json
{
  "success": true,
  "message": "Student grades retrieved successfully",
  "data": [
    {
      "id": "6a74d4d4227980ef47110c05",
      "student": { "id": "6a6d...", "fullName": "Mostafa Ali", "email": "mostafa@example.com", "educationLevel": "preparatory-3" },
      "collectionId": { "id": "6a74...", "name": "Web", "subject": "Web Development" },
      "examType": "midterm",
      "title": "Midterm",
      "examDate": "2026-08-05T00:00:00.000Z",
      "score": 38,
      "totalScore": 50,
      "homework": null,
      "recordedBy": "6a6d...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "pagination": { "total": 2, "count": 2, "page": 1, "limit": 2, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false },
    "summary": {
      "examCount": 2,
      "totalScored": 55,
      "totalPossible": 70,
      "averagePercentage": 78.57,
      "bestPercentage": 85,
      "worstPercentage": 76,
      "byExamType": [
        { "examType": "midterm", "count": 1, "averagePercentage": 76 },
        { "examType": "quiz", "count": 1, "averagePercentage": 85 }
      ]
    }
  },
  "timestamp": "..."
}
```
Note the list items here do **not** include a `percentage` field (unlike the single-item
create response) — compute it client-side as `score / totalScore * 100` if you need it
per-row, or just rely on `meta.summary` for aggregates.

---

### 5. Your own grades (student)
`GET /grades/me` — **student only**

Identical shape to #4, scoped to the caller automatically. Same query params
(`page`, `limit`, `collection`, `examType`), same `meta.summary` block.

---

### 6. Get / update / delete one grade
`GET /grades/{id}` · `PATCH /grades/{id}` · `DELETE /grades/{id}` — **instructor only**

**PATCH body** (all optional, at least one required):
```json
{ "score": 18, "notes": "Regraded after review" }
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Grade updated successfully",
  "data": {
    "id": "6a74d4d4227980ef47110c00",
    "score": 18,
    "totalScore": 20,
    "notes": "Regraded after review",
    "...": "..."
  },
  "timestamp": "..."
}
```

#### ⚠️ How `score > totalScore` is reported — different on create vs. update
This is worth knowing precisely since your error-handling branches on it:
- **On create (#1)**, an invalid score/totalScore pair is caught **during request
  validation**, before the service runs → **`422 UNPROCESSABLE_ENTITY`**, with
  `error.details: [{ field: "score", message: "score cannot exceed totalScore" }]`.
- **On update (PATCH here)**, the same rule is enforced **in the service layer** against
  the merged (existing + patched) values → **`400 BAD_REQUEST`**, with a plain
  `message: "score cannot exceed totalScore"` and no `error.details` array.

If you write one shared error handler for "invalid score", check both `422` (with
`details`) and `400` (with just `message`) — don't assume the shape is identical
between the create and update forms.

**DELETE response:** `{ "data": { "id": "..." } }`.

---

### 7. Grade summary for a student
`GET /grades/summary/student/{studentId}` — **instructor only**

| Query param | Notes |
|---|---|
| `collection` | narrow to one collection |

**Response `200`:** the same `summary` object shown nested in #4/#5, but standalone —
use this when you just want the headline stats without the full grade list (e.g. a
compact stat card on the student's profile).
```json
{
  "success": true,
  "message": "Grade summary retrieved successfully",
  "data": {
    "examCount": 2,
    "totalScored": 55,
    "totalPossible": 70,
    "averagePercentage": 78.57,
    "bestPercentage": 85,
    "worstPercentage": 76,
    "byExamType": [
      { "examType": "midterm", "count": 1, "averagePercentage": 76 },
      { "examType": "quiz", "count": 1, "averagePercentage": 85 }
    ]
  },
  "timestamp": "..."
}
```

---

### 8. Class-wide summary for a collection
`GET /grades/summary/collection/{collectionId}` — **instructor only**, no query params

Per-exam-type averages across **every student** in the collection — good for a
"how did the class do on the midterm" view.

**Response `200`:**
```json
{
  "success": true,
  "message": "Collection grade summary retrieved successfully",
  "data": [
    { "examType": "midterm", "count": 2, "averagePercentage": 82 },
    { "examType": "quiz", "count": 1, "averagePercentage": 85 }
  ],
  "timestamp": "..."
}
```
`count` here is the number of **grade records**, not students — two grades of the same
exam type both count. Cross-reference against roster size if you want a completion rate
("2 of 4 students graded").

---

### 9. Exam types
`GET /grades/exam-types`

**Response `200`:**
```json
{ "success": true, "message": "Exam types retrieved successfully", "data": ["quiz", "assignment", "homework", "midterm", "final"], "timestamp": "..." }
```
Static list, safe to hardcode client-side too, but fetching it keeps your dropdown in
sync if the backend ever adds a type.

---

### 10. Upcoming exams
`GET /grades/upcoming` — **instructor only**

| Query param | Default | Range |
|---|---|---|
| `days` | `7` | 1–90 |

**Response `200`:**
```json
{ "success": true, "message": "Upcoming exams retrieved successfully", "data": [], "timestamp": "..." }
```
Empty array is normal if nothing's scheduled in the window. Each item (when present) is
a full grade object with a **future** `examDate` — i.e., these are grade records created
ahead of time as a way of scheduling an exam, not results yet. Good source for a
"this week's exams" dashboard widget.

---

## Quick reference table

| # | Action | Method & URL | Who |
|---|---|---|---|
| 1 | Add a grade | `POST /grades` | instructor |
| 2 | Bulk-record one exam | `POST /grades/bulk` | instructor |
| 3 | List (full query) | `GET /grades` | instructor |
| 4 | A student's grades | `GET /grades/student/{studentId}` | both (scoped) |
| 5 | Own grades | `GET /grades/me` | student |
| 6 | Get / update / delete | `GET`/`PATCH`/`DELETE /grades/{id}` | instructor |
| 7 | Student summary | `GET /grades/summary/student/{studentId}` | instructor |
| 8 | Class summary | `GET /grades/summary/collection/{collectionId}` | instructor |
| 9 | Exam types | `GET /grades/exam-types` | both |
| 10 | Upcoming exams | `GET /grades/upcoming` | instructor |

---

## Data shapes

**`examType`** — `"quiz"` \| `"assignment"` \| `"homework"` \| `"midterm"` \| `"final"`

**Full grade object:**
```ts
{
  id: string
  student: string | { id, fullName, email, educationLevel }   // populated on most GETs
  collectionId: string | { id, name, subject }                 // populated on most GETs
  examType: "quiz" | "assignment" | "homework" | "midterm" | "final"
  title?: string
  examDate: string        // ISO date
  score: number
  totalScore: number
  percentage?: number      // present on the create (#1) response only — derive yourself elsewhere
  homework: string | null  // linked homework assignment id, if any
  notes?: string
  recordedBy: string
  createdAt: string
  updatedAt: string
}
```

**Summary object** (from #4, #5, #7 — nested or standalone):
```ts
{
  examCount: number
  totalScored: number
  totalPossible: number
  averagePercentage: number   // weighted, see below
  bestPercentage: number
  worstPercentage: number
  byExamType: Array<{ examType, count, averagePercentage }>
}
```

**Class summary** (from #8) — a bare array, no wrapper object:
```ts
Array<{ examType, count, averagePercentage }>
```

---

## How the average is calculated

Worth knowing so your UI doesn't contradict the server's math:

> `averagePercentage` is **score-weighted** — `totalScored ÷ totalPossible × 100` —
> **not** a simple mean of each exam's percentage. A 45/50 midterm counts more than a
> 9/10 quiz, because it's summed at the raw-score level first. If you ever compute an
> average client-side (e.g. for a live preview before the grade is saved), use the same
> weighted formula or your number will disagree with what the server reports.

---

## Frontend build plan

1. **Grade entry screen (instructor)** — pick a collection + exam type + date, then
   either:
   - single-student form → #1, or
   - whole-class grid (one row per enrolled student, one score column) → #2 (bulk).
   Build the bulk grid first — it's the one you'll use most for quizzes/exams.
2. **Grades list / history (instructor)** — #3 with filters (collection, exam type,
   date range) as a searchable table.
3. **Student grade detail** — #7 (summary card: average, best, worst, per-type
   breakdown) + #4 (full history table) on the same page. Reuse this exact layout for
   the student's own view via #5 (same shape, no `studentId` needed).
4. **Class performance view** — #8 as a small bar chart or table (exam type → average),
   on the collection detail page from the Collections module.
5. **"Upcoming exams" widget** — #10, e.g. on the dashboard or a "this week" panel.
   Populate it by creating grade records with a future `examDate` via #1 before the
   exam actually happens (the results get filled in later via #6's PATCH).
6. **Exam type dropdown** — #9, wire it once and reuse everywhere you pick an exam type.

**Score-vs-total input widget:** since `score` cannot exceed `totalScore`, disable/clamp
the score input client-side once `totalScore` is set, so users don't hit the 422/400
(see the [note above](#6-get--update--delete-one-grade)) on typos.

---

## Suggested API client

```js
// grades.api.js
const BASE = '/grades';
const qs = (params) => new URLSearchParams(params).toString();

export const addGrade = (payload) =>
  apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });

export const addGradesBulk = (payload) =>
  apiFetch(`${BASE}/bulk`, { method: 'POST', body: JSON.stringify(payload) });

export const listGrades = (params) => apiFetch(`${BASE}?${qs(params)}`);

export const listStudentGrades = (studentId, params) =>
  apiFetch(`${BASE}/student/${studentId}?${qs(params)}`);

export const listMyGrades = (params) => apiFetch(`${BASE}/me?${qs(params)}`);

export const getGrade = (id) => apiFetch(`${BASE}/${id}`);

export const updateGrade = (id, payload) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteGrade = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });

export const getStudentGradeSummary = (studentId, params) =>
  apiFetch(`${BASE}/summary/student/${studentId}?${qs(params)}`);

export const getCollectionGradeSummary = (collectionId) =>
  apiFetch(`${BASE}/summary/collection/${collectionId}`);

export const getExamTypes = () => apiFetch(`${BASE}/exam-types`);

export const getUpcomingExams = (days = 7) =>
  apiFetch(`${BASE}/upcoming?${qs({ days })}`);
```

---

## Error handling checklist

| Status | `error.code` / shape | Meaning here | UI response |
|---|---|---|---|
| 400 | `BAD_REQUEST`, plain `message`, no `details` | student not enrolled; homework belongs to a different collection; **or** PATCH pushed `score` above `totalScore` | show `message` directly |
| 403 | `INSUFFICIENT_ROLE` / `FORBIDDEN` | student hit an instructor-only endpoint, or requested another student's grades/summary | hide the control for student accounts |
| 404 | `NOT_FOUND` | bad `{id}` / `{studentId}` / `{collectionId}` | redirect / remove row |
| 422 | `UNPROCESSABLE_ENTITY`, has `error.details[]` | validation failed — **including** `score > totalScore` on create (#1) | map `error.details[].field` to form fields |

---

*Previous: [`05-attendance.md`](./05-attendance.md). Next up: **Payments** — the last of
the three independent verticals (Attendance/Grades/Payments) built on Collections.*
