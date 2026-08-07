# Frontend Integration — Remaining Modules

> Build order so far: **Auth → Students → Dashboard → Collections → Attendance →
> Grades → Payments → Notifications → Finance → (this doc).**
>
> This single doc covers **everything left to build**: five modules, grouped into two
> parts because they share a build pattern each.
>
> - **Part A — File modules** (Lessons, Homework, Attachments): all three are
>   "upload a file to a collection" screens using the exact multipart pattern you
>   already built for profile images.
> - **Part B — Reports & Settings**: Reports reads everything you've already built;
>   Settings is small and standalone.

**Base URL:** `http://localhost:5055/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` on everything below.

---

## Contents

- [Part A — File modules](#part-a--file-modules)
  - [The shared upload pattern](#the-shared-upload-pattern)
  - [A1. Lessons](#a1-lessons)
  - [A2. Homework](#a2-homework)
  - [A3. Attachments](#a3-attachments)
- [Part B — Reports & Settings](#part-b--reports--settings)
  - [B1. Reports](#b1-reports)
  - [B2. Settings](#b2-settings)
- [Master endpoint table](#master-endpoint-table)
- [Frontend build plan](#frontend-build-plan)
- [Suggested API clients](#suggested-api-clients)
- [Error handling checklist](#error-handling-checklist)

---

## Part A — File modules

### The shared upload pattern

All three modules below follow the identical shape you already know from student/
instructor profile images:

```
Upload:   multipart/form-data POST/PATCH, file field name varies per module
Response: a "file" (or "attachments" array) descriptor: { url, key, provider, originalName, mimeType, size, kind }
Display:  GET /files/{key}  (authenticated)  — or the public /uploads/{key} path for <img>/<embed>
Download: each module also exposes its own /{id}/download endpoint that
          streams the file with a proper Content-Disposition: attachment header
```

**Accepted file types across all three:** PDF, images (JPEG/PNG/WebP/GIF/BMP/SVG),
Word, PowerPoint, Excel/CSV, video. Rejected types return `415`.

**Role split (same across all three):**
| Action | instructor | student |
|---|---|---|
| Upload / update / delete | ✅ | ❌ |
| List / view / download | ✅ (any collection) | ✅ (only collections they're enrolled in, published items only) |

---

### A1. Lessons

Lesson material — one file per lesson record, scoped to a collection.

#### Upload a lesson
`POST /lessons` — **instructor only**, `multipart/form-data`

```
file:          <binary>              (field name: "file")
collectionId:  6a74d01c227980ef471108da
lessonName:    Intro to HTML
className:     Week 1                (optional)
description:   ...                   (optional)
order:         1                     (optional, default 0 — controls display order)
isPublished:   true                  (optional, default true)
```

**Response `201`** — real payload:
```json
{
  "success": true,
  "message": "Lesson uploaded successfully",
  "data": {
    "id": "6a755631227980ef4711106e",
    "collectionId": "6a74d01c227980ef471108da",
    "lessonName": "Intro to HTML",
    "className": "Week 1",
    "file": {
      "url": "/uploads/lessons/6a74d01c227980ef471108da/lesson-1786074673493-e279a2690c6b.pdf",
      "key": "lessons/6a74d01c227980ef471108da/lesson-1786074673493-e279a2690c6b.pdf",
      "provider": "local",
      "originalName": "lesson.pdf",
      "mimeType": "application/pdf",
      "size": 68,
      "kind": "pdf"
    },
    "isPublished": true,
    "order": 1,
    "downloadCount": 0,
    "uploadedBy": "6a6d3bb82b51705e3108abaa",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
`lessonName` must be unique **within the collection** — `409` on a duplicate.

#### List lessons in a collection
`GET /lessons/collection/{collectionId}`

Students see only `isPublished: true` items; instructors see everything including
drafts.

**Response `200`** — real payload, note `collectionId` and `uploadedBy` are populated:
```json
{
  "success": true,
  "message": "Collection lessons retrieved successfully",
  "data": [
    {
      "id": "6a755631227980ef4711106e",
      "collectionId": { "id": "6a74...", "name": "Web", "subject": "Web Development", "educationLevel": "secondary-1" },
      "lessonName": "Intro to HTML",
      "className": "Week 1",
      "file": { "url": "...", "key": "...", "kind": "pdf", "...": "..." },
      "isPublished": true,
      "order": 1,
      "downloadCount": 0,
      "uploadedBy": { "id": "6a6d...", "fullName": "Head Instructor" },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "pagination": { "total": 1, "count": 1, "page": 1, "limit": 20, "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false } },
  "timestamp": "..."
}
```
Also supports `?page=`, `?limit=`, `?search=` (matches lessonName/className/description).

#### Get / list (general) / update / delete
- `GET /lessons` — instructor-only general query (`collection`, `className`, `fileKind`, `isPublished` filters)
- `GET /lessons/{id}` — get one, access-scoped same as the collection list
- `PATCH /lessons/{id}` — instructor only; send as `multipart/form-data` with a new `file` field to **replace** the stored file, or plain fields to update metadata only
- `DELETE /lessons/{id}` — instructor only, soft-delete (file blob retained)
- `DELETE /lessons/{id}/purge` — instructor only, **permanently** deletes the record and its stored file (use for real cleanup, not routine deletion)

#### Download
`GET /lessons/{id}/download` — increments `downloadCount`, then either streams the file
(local storage, real headers verified):
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="lesson.pdf"
```
...or `302` redirects to the provider URL (cloud storage). Use `window.location.href =`
or an `<a href>` to this URL rather than `fetch` if you want the browser to handle the
download natively.

---

### A2. Homework

Assignments with a due date, optionally with multiple attachments.

#### Create homework
`POST /homework` — **instructor only**, `multipart/form-data` (or plain JSON if no
attachments — both work, see the field list below)

```
collectionId:   6a74d01c227980ef471108da
title:          Chapter 1 exercises
description:    ...                    (optional)
dueDate:        2026-09-01T00:00:00.000Z
totalScore:     20                      (optional)
isPublished:    true                    (optional, default true)
attachments:    <binary>, <binary>, ... (optional, field name "attachments", up to 10 files)
```

**Response `201`** — real payload:
```json
{
  "success": true,
  "message": "Homework created successfully",
  "data": {
    "id": "6a755653227980ef4711107e",
    "title": "Chapter 1 exercises",
    "collectionId": "6a74d01c227980ef471108da",
    "dueDate": "2026-09-01T00:00:00.000Z",
    "attachments": [
      { "url": "...", "key": "homework/6a74.../lesson-....pdf", "provider": "local", "originalName": "lesson.pdf", "mimeType": "application/pdf", "size": 68, "kind": "other" }
    ],
    "totalScore": 20,
    "isPublished": true,
    "createdBy": "6a6d3bb82b51705e3108abaa",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```

⚠️ **Observed quirk worth knowing:** in the real response above, the uploaded PDF's
`kind` came back as `"other"` here, whereas the *identical file* uploaded to Lessons
(A1) or Attachments (A3) came back as `"kind": "pdf"`. Don't rely on `attachments[].kind`
being accurate for homework specifically — fall back to checking `mimeType` or the file
extension in `originalName` if you need to pick an icon for a homework attachment.

Publishing homework (`isPublished: true`, whether at creation or via a later PATCH that
flips it from `false`→`true`) automatically notifies every enrolled student — no extra
call needed.

#### List / get
- `GET /homework` — instructor-only general query
- `GET /homework/collection/{collectionId}` — students see published only, same pattern as Lessons
- `GET /homework/me` — **student only**, published homework across all their collections
- `GET /homework/upcoming?days=7` — instructor only, homework due within N days (1–90)
- `GET /homework/{id}` — get one, access-scoped

#### Update / delete
- `PATCH /homework/{id}` — instructor only, plain JSON (title/description/dueDate/totalScore/isPublished)
- `DELETE /homework/{id}` — instructor only, deletes the record **and all its attachments**

#### Attachments sub-resource
- `POST /homework/{id}/attachments` — instructor only, `multipart/form-data`, field `attachments` (up to 10) — **adds** to the existing array, doesn't replace it
- `DELETE /homework/{id}/attachments` — instructor only, JSON body `{ "key": "homework/.../file.pdf" }` — removes exactly one attachment by its storage key

There's no dedicated homework download endpoint — attachments are downloaded directly
via `GET /files/{key}` (or the public `/uploads/{key}` path), using the `key` from the
attachment object.

---

### A3. Attachments

General-purpose files attached to a collection (syllabi, reference sheets) — distinct
from Lessons (curriculum-ordered material) and Homework attachments (scoped to one
assignment).

#### Upload
`POST /attachments` — **instructor only**, `multipart/form-data`

```
file:                 <binary>
collectionId:         6a74d01c227980ef471108da
name:                 Term syllabus         (optional — defaults to the original filename)
description:          ...                    (optional)
isVisibleToStudents:  true                   (optional, default true)
```

**Response `201`** — real payload:
```json
{
  "success": true,
  "message": "Attachment uploaded successfully",
  "data": {
    "id": "6a755673227980ef4711108e",
    "collectionId": "6a74d01c227980ef471108da",
    "name": "Term syllabus",
    "file": { "url": "...", "key": "attachments/6a74.../lesson-....pdf", "kind": "pdf", "...": "..." },
    "uploadedBy": "6a6d3bb82b51705e3108abaa",
    "uploadDate": "...",
    "isVisibleToStudents": true,
    "downloadCount": 0,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "timestamp": "..."
}
```
Set `isVisibleToStudents: false` for instructor-only files (e.g. answer keys) — they
simply won't appear when a student calls the list endpoint.

#### List / get / update / delete / download
Identical pattern to Lessons (A1), same visibility rule as `isPublished` there:
- `GET /attachments` — instructor-only general query
- `GET /attachments/collection/{collectionId}` — students see `isVisibleToStudents: true` only
- `GET /attachments/{id}` — get one
- `PATCH /attachments/{id}` — instructor only, `multipart/form-data` with optional new `file` to replace
- `DELETE /attachments/{id}` — instructor only
- `GET /attachments/{id}/download` — same streaming/redirect behavior as Lessons

---

## Part B — Reports & Settings

### B1. Reports

Per-student report combining profile, attendance, grades, homework, payments,
performance and notes — computed **live** every time (not cached), available as JSON
or PDF.

**Role split:**
| Action | instructor | student |
|---|---|---|
| Generate any student's report | ✅ | ❌ |
| Generate own report | — | ✅ |
| Export PDF (own or any) | ✅ / own | ✅ own only |
| Archive a PDF + view report history | ✅ | ❌ |

#### Generate a report (JSON)
`GET /reports/student/{studentId}` — instructor (any) / **or** `GET /reports/me` — student (own)

| Query param | Notes |
|---|---|
| `collectionId` | restrict the report to one collection |
| `from`, `to` | ISO dates — restrict the period |

**Response `200`** — real payload (trimmed to the shape; full attendance/grade/payment
record arrays included too, same item shapes as their respective modules):
```json
{
  "success": true,
  "message": "Report generated successfully",
  "data": {
    "generatedAt": "2026-08-07T03:52:19.985Z",
    "period": { "from": null, "to": null },
    "institution": { "name": "Education Management System", "contactPhone": "...", "contactEmail": "...", "addressLine": "" },
    "student": {
      "id": "6a6d3bb92b51705e3108abee",
      "fullName": "Mostafa Ali",
      "email": "mostafa@example.com",
      "age": 15,
      "phone": "...", "parentPhone": "...",
      "educationLevel": "preparatory-3",
      "school": "El Salam School",
      "address": { "city": "Giza", "governorate": "Giza", "country": "Egypt" },
      "status": "active",
      "performance": "average",
      "enrolledAt": "...",
      "collections": [{ "id": "6a74...", "name": "Web", "subject": "Web Development", "educationLevel": "secondary-1" }]
    },
    "attendance": {
      "summary": { "totalPresent": 3, "totalAbsent": 2, "totalPending": 0, "totalSessions": 5, "attendancePercentage": 60, "threshold": 50, "hasWarning": false },
      "records": [ /* same shape as the Attendance module's records */ ]
    },
    "grades": {
      "summary": { "examCount": 3, "totalScored": 68, "totalPossible": 170, "averagePercentage": 40, "bestPercentage": 90, "worstPercentage": 12, "byExamType": [ { "examType": "midterm", "count": 1, "averagePercentage": 76 }, { "examType": "quiz", "count": 2, "averagePercentage": 25 } ] },
      "records": [ /* same shape as the Grades module's records */ ]
    },
    "homework": {
      "summary": { "total": 1, "graded": 0, "overdue": 0, "averagePercentage": 0 },
      "records": [ /* homework items, each with a computed "result" and "percentage" once graded */ ]
    },
    "payments": {
      "summary": { "pending": { "count": 1, "total": 10 }, "paid": { "count": 0, "total": 0 }, "late": { "count": 0, "total": 0 }, "outstanding": 10, "totalBilled": 10, "status": "pending" },
      "records": [ /* same shape as the Payments module's records */ ]
    },
    "notes": []
  },
  "timestamp": "..."
}
```
Every `summary` block here is **identical in shape** to the corresponding module's own
summary endpoint (`GET /attendance/summary`, `GET /grades/summary/student/{id}`,
`GET /payments/summary`) — if you've already built stat cards for those, you can reuse
the exact same rendering component here.

#### Export as PDF
`GET /reports/student/{studentId}/pdf` (instructor) / `GET /reports/me/pdf` (student) —
same query params as above, plus:

| Query param | Notes |
|---|---|
| `archive` | `true`/`false` (default `false`) — instructor only meaningfully; also stores a copy and creates a history record |

**Response `200`** — real headers confirmed:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="report-mostafa-ali-2026-08-07.pdf"
```
With `?archive=true`, an additional header is present: `X-Report-Id: 6a7556b1...` — the
id of the archived record, in case you want to link to it afterward. **This is a
different response format from every other endpoint in the API** — it's a raw binary
stream, not the JSON envelope. Handle it with `window.open(url)`, an `<a href>` with
`download`, or a `blob` response type in your HTTP client — not your normal JSON parser.

Since this is a `GET` with a bearer token requirement, you can't just set
`<a href="...">` directly (the browser won't attach the Authorization header) — either
fetch it as a blob and create an object URL, or build a short-lived signed-link
mechanism if you want simple `<a>`-tag downloads. (There's no dedicated
signed-download endpoint for reports yet — blob-fetch is the way for now.)

#### Report history (instructor only)
- `GET /reports` — paginated list of archived report records (from `?archive=true` calls), filterable by `?student=`
- `GET /reports/{id}` — one archived record's metadata + snapshot (not the PDF itself — use the `file.key` with `/files/{key}` to fetch the actual PDF bytes)
- `DELETE /reports/{id}` — deletes the record and its stored PDF

**Real payload** (list item) — note `snapshot` freezes the summary figures **at
generation time**, and `file` is `null` for a report that was generated without
`archive=true` (there's a record either way, but only archived ones have a stored PDF):
```json
{
  "id": "6a7556b1227980ef4711111f",
  "student": { "id": "6a6d...", "fullName": "Mostafa Ali", "email": "mostafa@example.com" },
  "collectionId": null,
  "periodFrom": null,
  "periodTo": null,
  "snapshot": { "attendance": { "...": "..." }, "grades": { "...": "..." }, "homework": { "...": "..." }, "payments": { "outstanding": 10, "totalBilled": 10, "status": "pending" }, "performance": "average" },
  "file": { "url": "...", "key": "reports/.../report-....pdf", "kind": "pdf", "...": "..." },
  "generatedBy": { "id": "6a6d...", "fullName": "Head Instructor" },
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### B2. Settings

Instructor-only profile, institution details, and preferences. (There's no
student-facing settings screen — a student's own info is edited through the Students
module, not here.)

#### Get everything
`GET /settings` — **instructor only**, no params

**Response `200`** — real payload:
```json
{
  "success": true,
  "message": "Settings retrieved successfully",
  "data": {
    "profile": {
      "id": "6a6d3bb82b51705e3108abaa",
      "fullName": "Head Instructor",
      "email": "instructor@edu-system.local",
      "phone": "+201000000000",
      "role": "instructor",
      "profileImage": { "url": "...", "key": "users/.../avatar-....png", "kind": "image", "...": "..." },
      "lastLoginAt": "..."
    },
    "settings": {
      "id": "6a6d3bb82b51705e3108abb7",
      "owner": "6a6d3bb82b51705e3108abaa",
      "institution": { "name": "Education Management System", "contactPhone": "...", "contactEmail": "...", "addressLine": "" },
      "preferences": { "attendanceWarningThreshold": 50, "locale": "en", "timezone": "Africa/Cairo", "currency": "EGP", "paymentGracePeriodDays": 0 },
      "notificationPreferences": { "email": true, "inApp": true, "attendanceWarnings": true, "latePayments": true, "pendingApprovals": true },
      "createdAt": "...",
      "updatedAt": "..."
    }
  },
  "timestamp": "..."
}
```
Two distinct sub-objects: `profile` (identity — name/email/phone/photo, lives on the
`User` record) and `settings` (preferences — institution info, thresholds,
notification toggles). Build two form sections, not one.

#### Update preferences
`PATCH /settings` — **instructor only**

Send only the nested object(s) you're changing — **merged field-by-field**, so a
partial `preferences` update doesn't wipe out `institution` or vice versa:
```json
{ "preferences": { "currency": "EGP" } }
```
**Response `200`:** the updated `settings` sub-object (same shape as `data.settings`
above) — note the response here is just `settings`, not the combined `{profile,
settings}` wrapper you get from the GET.

You can update any combination of `institution`, `preferences`,
`notificationPreferences` in one call — each is merged independently.

#### Update identity fields
`PATCH /settings/profile` — **instructor only**

```json
{ "fullName": "Head Instructor", "email": "new@example.com", "phone": "+201000000001" }
```
All optional, send only what changed. Changing `email` checks it's not already used by
another account — `409` if it is.

**Response `200`:** `{ id, fullName, email, phone, profileImage }`.

#### Profile image
- `PATCH /settings/profile-image` — `multipart/form-data`, field `image` (same rules as student profile images: JPEG/PNG/WebP/GIF/BMP/SVG, max 5MB)
- `DELETE /settings/profile-image` — removes it, no body

Response shape identical to the Students module's profile-image endpoint:
`{ profileImage: { url, key, ... } | null }`.

#### Change password
`PATCH /settings/change-password` — **instructor only**

```json
{ "currentPassword": "...", "newPassword": "..." }
```
This is **functionally identical** to `PATCH /auth/change-password` from the Auth
module — same validation, same "revokes all sessions" behavior — just exposed here too
so your Settings screen doesn't need to call a different base path for one field. Pick
whichever endpoint fits your app's navigation better; they do the same thing.

---

## Master endpoint table

| Module | Action | Method & URL | Who |
|---|---|---|---|
| **Lessons** | Upload | `POST /lessons` | instructor |
| | List (general) | `GET /lessons` | instructor |
| | List by collection | `GET /lessons/collection/{collectionId}` | both (scoped) |
| | Get one | `GET /lessons/{id}` | both (scoped) |
| | Update / replace file | `PATCH /lessons/{id}` | instructor |
| | Delete (soft) | `DELETE /lessons/{id}` | instructor |
| | Purge (permanent) | `DELETE /lessons/{id}/purge` | instructor |
| | Download | `GET /lessons/{id}/download` | both (scoped) |
| **Homework** | Create | `POST /homework` | instructor |
| | List (general) | `GET /homework` | instructor |
| | List by collection | `GET /homework/collection/{collectionId}` | both (scoped) |
| | Own homework | `GET /homework/me` | student |
| | Upcoming | `GET /homework/upcoming` | instructor |
| | Get one | `GET /homework/{id}` | both (scoped) |
| | Update | `PATCH /homework/{id}` | instructor |
| | Delete | `DELETE /homework/{id}` | instructor |
| | Add attachments | `POST /homework/{id}/attachments` | instructor |
| | Remove one attachment | `DELETE /homework/{id}/attachments` | instructor |
| **Attachments** | Upload | `POST /attachments` | instructor |
| | List (general) | `GET /attachments` | instructor |
| | List by collection | `GET /attachments/collection/{collectionId}` | both (scoped) |
| | Get one | `GET /attachments/{id}` | both (scoped) |
| | Update / replace file | `PATCH /attachments/{id}` | instructor |
| | Delete | `DELETE /attachments/{id}` | instructor |
| | Download | `GET /attachments/{id}/download` | both (scoped) |
| **Reports** | Generate (any student) | `GET /reports/student/{studentId}` | instructor |
| | Generate (own) | `GET /reports/me` | student |
| | Export PDF (any) | `GET /reports/student/{studentId}/pdf` | instructor |
| | Export PDF (own) | `GET /reports/me/pdf` | student |
| | History list | `GET /reports` | instructor |
| | History detail | `GET /reports/{id}` | instructor |
| | Delete archived report | `DELETE /reports/{id}` | instructor |
| **Settings** | Get all | `GET /settings` | instructor |
| | Update preferences | `PATCH /settings` | instructor |
| | Update identity | `PATCH /settings/profile` | instructor |
| | Upload photo | `PATCH /settings/profile-image` | instructor |
| | Remove photo | `DELETE /settings/profile-image` | instructor |
| | Change password | `PATCH /settings/change-password` | instructor |

---

## Frontend build plan

**Recommended order:**

1. **Lessons** first — simplest of the three file modules (single file, ordered list).
2. **Attachments** next — nearly identical to Lessons, minus the ordering/className
   fields, plus the visibility toggle.
3. **Homework** last of the three — adds the due-date and multi-attachment complexity,
   and the notification side effect on publish.
4. **Reports** — build the "Generate Report" button on a student's detail page first
   (JSON view, reusing your existing summary-card components from Attendance/Grades/
   Payments), then add the "Export PDF" button (handle the blob-fetch requirement), then
   the archive/history list last since it's the least-used path.
5. **Settings** — smallest module here, build whenever convenient; no dependencies on
   anything else.

**Shared component to build once, reuse three times:** a `<FileUploadField>` that
handles the multipart form construction and shows upload progress — Lessons, Homework
attachments, and Attachments all need it, plus Students/Settings profile images already
needed it. That's five call sites for one component.

**Shared component to build once, reuse everywhere:** a `<FileLink>` that takes a
`{ key, originalName, kind }` object and renders an icon + download link pointing at
`GET /files/{key}` — every file descriptor in the entire API (profile images, lessons,
homework attachments, generic attachments, report PDFs) has this exact shape.

---

## Suggested API clients

```js
// lessons.api.js
const BASE = '/lessons';
const qs = (params) => new URLSearchParams(params).toString();

export const uploadLesson = (formData) =>
  apiFetch(BASE, { method: 'POST', body: formData });

export const listLessons = (params) => apiFetch(`${BASE}?${qs(params)}`);
export const listCollectionLessons = (collectionId, params) =>
  apiFetch(`${BASE}/collection/${collectionId}?${qs(params)}`);
export const getLesson = (id) => apiFetch(`${BASE}/${id}`);
export const updateLesson = (id, formData) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: formData });
export const deleteLesson = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
export const purgeLesson = (id) => apiFetch(`${BASE}/${id}/purge`, { method: 'DELETE' });
export const downloadLessonUrl = (id) => `${API_ORIGIN}/api/v1${BASE}/${id}/download`;
```

```js
// homework.api.js
const BASE = '/homework';
const qs = (params) => new URLSearchParams(params).toString();

export const createHomework = (formData) =>
  apiFetch(BASE, { method: 'POST', body: formData });

export const listHomework = (params) => apiFetch(`${BASE}?${qs(params)}`);
export const listCollectionHomework = (collectionId, params) =>
  apiFetch(`${BASE}/collection/${collectionId}?${qs(params)}`);
export const listMyHomework = (params) => apiFetch(`${BASE}/me?${qs(params)}`);
export const getUpcomingHomework = (days = 7) => apiFetch(`${BASE}/upcoming?${qs({ days })}`);
export const getHomework = (id) => apiFetch(`${BASE}/${id}`);
export const updateHomework = (id, payload) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteHomework = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
export const addHomeworkAttachments = (id, formData) =>
  apiFetch(`${BASE}/${id}/attachments`, { method: 'POST', body: formData });
export const removeHomeworkAttachment = (id, key) =>
  apiFetch(`${BASE}/${id}/attachments`, { method: 'DELETE', body: JSON.stringify({ key }) });
```

```js
// attachments.api.js
const BASE = '/attachments';
const qs = (params) => new URLSearchParams(params).toString();

export const uploadAttachment = (formData) =>
  apiFetch(BASE, { method: 'POST', body: formData });

export const listAttachments = (params) => apiFetch(`${BASE}?${qs(params)}`);
export const listCollectionAttachments = (collectionId, params) =>
  apiFetch(`${BASE}/collection/${collectionId}?${qs(params)}`);
export const getAttachment = (id) => apiFetch(`${BASE}/${id}`);
export const updateAttachment = (id, formData) =>
  apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: formData });
export const deleteAttachment = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
export const downloadAttachmentUrl = (id) => `${API_ORIGIN}/api/v1${BASE}/${id}/download`;
```

```js
// reports.api.js
const BASE = '/reports';
const qs = (params) => new URLSearchParams(params).toString();

export const getStudentReport = (studentId, params) =>
  apiFetch(`${BASE}/student/${studentId}?${qs(params)}`);
export const getMyReport = (params) => apiFetch(`${BASE}/me?${qs(params)}`);

// PDF responses are binary — fetch as a blob, not through your JSON apiFetch wrapper.
export async function downloadStudentReportPdf(studentId, params = {}, token) {
  const res = await fetch(`${API_ORIGIN}/api/v1${BASE}/student/${studentId}/pdf?${qs(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'report.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

export const listReportHistory = (params) => apiFetch(`${BASE}?${qs(params)}`);
export const getReportRecord = (id) => apiFetch(`${BASE}/${id}`);
export const deleteReportRecord = (id) => apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
```

```js
// settings.api.js
const BASE = '/settings';

export const getSettings = () => apiFetch(BASE);
export const updateSettings = (payload) =>
  apiFetch(BASE, { method: 'PATCH', body: JSON.stringify(payload) });
export const updateProfile = (payload) =>
  apiFetch(`${BASE}/profile`, { method: 'PATCH', body: JSON.stringify(payload) });
export const uploadSettingsProfileImage = (formData) =>
  apiFetch(`${BASE}/profile-image`, { method: 'PATCH', body: formData });
export const removeSettingsProfileImage = () =>
  apiFetch(`${BASE}/profile-image`, { method: 'DELETE' });
export const changeSettingsPassword = (payload) =>
  apiFetch(`${BASE}/change-password`, { method: 'PATCH', body: JSON.stringify(payload) });
```

---

## Error handling checklist

| Status | Meaning | Where it shows up | UI response |
|---|---|---|---|
| 403 | wrong role, or student not enrolled in the collection | any file module's write endpoints; Reports for another student | hide the control / redirect |
| 404 | bad `{id}` | everywhere | remove row / redirect |
| 409 | duplicate `lessonName` within a collection (Lessons); email already in use (Settings profile) | `POST /lessons`, `PATCH /settings/profile` | inline message near the field |
| 413 | file too large | any upload endpoint | "File exceeds the size limit" |
| 415 | unsupported file type | any upload endpoint | "Unsupported file type — allowed: PDF, images, Word, PowerPoint, Excel, video" |
| 422 | validation | everywhere | map `error.details[].field` to form fields |

---

*Previous: [`09-finance.md`](./09-finance.md).*

**This completes the full module set.** All 14 backend modules now have frontend
integration guidance — Auth (chat-only) plus the 13 documented files
(`02` through this one). At this point your frontend build should cover the entire API
surface.
