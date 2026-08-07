# Education Management System — Backend

Production-ready RESTful API for running a private tutoring practice or small academy:
students, teaching groups, lesson material, homework, attendance, grades, payments,
finances, reports and an instructor dashboard.

Built with **Node.js · Express · MongoDB · Mongoose · JWT · Zod · Swagger**.

---

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Authentication & roles](#authentication--roles)
- [Student registration flow](#student-registration-flow)
- [API conventions](#api-conventions)
- [Endpoint map](#endpoint-map)
- [Business rules](#business-rules)
- [Data model](#data-model)
- [File storage](#file-storage)
- [Security](#security)
- [Configuration](#configuration)
- [Scripts](#scripts)

---

## Quick start

**Requirements:** Node.js ≥ 18 and a running MongoDB (local or Atlas).

```bash
npm install
cp .env.example .env          # then edit the JWT secrets at minimum
npm run seed -- --demo        # instructor account + demo collections/students
npm run dev
```

| URL | Description |
| --- | --- |
| `http://localhost:5000/api/v1` | API root |
| `http://localhost:5000/docs` | Swagger UI (interactive) |
| `http://localhost:5000/docs.json` | Raw OpenAPI 3 document |
| `http://localhost:5000/api/v1/health` | Health/readiness probe |

The seed prints the bootstrap credentials — by default
`instructor@edu-system.local` / `Instructor@123`. **Change these before deploying.**

> **macOS note:** port 5000 is taken by the AirPlay Receiver. Either disable it under
> *System Settings → General → AirDrop & Handoff*, or set `PORT=5055` in `.env`.

### First requests

```bash
# 1. Sign in
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"instructor@edu-system.local","password":"Instructor@123"}'

# 2. Use the returned accessToken
curl -s http://localhost:5000/api/v1/dashboard \
  -H "Authorization: Bearer <accessToken>"
```

---

## Architecture

A four-layer separation, applied consistently in every module:

```
   HTTP request
        │
        ▼
┌─────────────────┐   Express router + Zod validation + auth/RBAC middleware
│     Routes      │   Also carries the Swagger annotations for its endpoints
└────────┬────────┘
         ▼
┌─────────────────┐   Thin HTTP adapter: read request → call one service → shape response
│   Controller    │   Contains no business rules
└────────┬────────┘
         ▼
┌─────────────────┐   Business rules, cross-module orchestration, invariants
│     Service     │   Extends BaseService for the mechanical CRUD parts
└────────┬────────┘
         ▼
┌─────────────────┐   All database access, aggregation pipelines, soft-delete scoping
│   Repository    │   Extends BaseRepository
└────────┬────────┘
         ▼
┌─────────────────┐
│  Mongoose model │   Schema, indexes, hooks, virtuals
└─────────────────┘
```

**Why the layers earn their keep here:**

- **Repository pattern** — services depend on a repository interface, not on Mongoose.
  Aggregation quirks (such as `$match` not casting ObjectIds) are solved once in
  `BaseRepository.matchStage()` instead of in fifteen pipelines.
- **Service layer** — invariants that span modules live in exactly one place. Settling a
  payment writes a revenue entry; recording attendance recomputes a student's cached
  percentage and fires the low-attendance rule. Neither can be bypassed by hitting a
  different endpoint.
- **SOLID in practice** — `BaseService`/`BaseRepository` supply the shared behaviour and
  subclasses override only what is genuinely different (open/closed). `Revenue` and
  `Expense` are one schema, one repository and one service instantiated twice, so the two
  ledgers cannot drift apart. `StorageDriver` is an interface with local and Cloudinary
  implementations; nothing above it knows which is active.

### Cross-cutting foundations

| Concern | Where | Notes |
| --- | --- | --- |
| Config | `src/config/env.js` | Zod-validated at boot; a bad env fails fast with a readable report |
| Logging | `src/config/logger.js` | Winston; coloured console in dev, rotating JSON files in prod |
| Errors | `src/middlewares/error.middleware.js` | Maps Mongoose/Zod/driver errors to HTTP semantics; hides internals in production |
| Responses | `src/core/ApiResponse.js` | One envelope for every endpoint |
| Querying | `src/core/QueryOptions.js` | Whitelisted pagination, sorting, search, filtering and operators |
| Soft delete | `src/core/plugins/softDelete.plugin.js` | `deletedAt`/`deletedBy`, transparently scoped by the repository |
| Serialisation | `src/core/plugins/toJSON.plugin.js` | `_id` → `id`, strips `__v` and any path marked `private` |

---

## Project structure

```
src/
├── app.js                     Express assembly (security → parsing → routes → errors)
├── server.js                  Boot, graceful shutdown, crash handlers
├── config/
│   ├── env.js                 Validated environment
│   ├── database.js            Mongo connection lifecycle
│   ├── logger.js              Winston
│   └── swagger.js             OpenAPI shell + shared components
├── core/
│   ├── ApiError.js            Operational error type with factories
│   ├── ApiResponse.js         Standard response envelope
│   ├── BaseRepository.js      Generic data access (+ aggregation ObjectId casting)
│   ├── BaseService.js         Generic CRUD behaviour
│   ├── QueryOptions.js        Query-string → safe Mongo query
│   ├── asyncHandler.js        Async route wrapper
│   ├── constants.js           Every domain enum, in one place
│   ├── httpStatus.js
│   ├── plugins/               softDelete, toJSON
│   └── schemas/               Shared sub-schemas (file, transaction)
├── middlewares/               auth, validate, upload, error, rateLimit, requestContext
├── modules/                   One folder per domain area
│   └── <module>/
│       ├── <name>.model.js
│       ├── <name>.repository.js
│       ├── <name>.service.js
│       ├── <name>.controller.js
│       ├── <name>.validation.js
│       └── <name>.routes.js   (+ Swagger annotations)
├── routes/index.js            Module mount table, health, API index
├── services/                  Cross-cutting services
│   ├── storage/               StorageDriver + Local + Cloudinary
│   ├── mail.service.js
│   └── pdf.service.js
├── scripts/seed.js
└── utils/                     token, password, date, file, validators
```

Modules: `auth`, `users`, `activation-codes`, `students`, `collections`,
`collection-students`, `lessons`, `homework`, `attachments`, `attendance`, `grades`,
`payments`, `revenues`, `expenses`, `finance`, `reports`, `notifications`, `settings`,
`dashboard`.

---

## Authentication & roles

JWT access/refresh pair. Access tokens are short-lived (15 min by default); refresh
tokens are long-lived, stored **hashed**, and **rotated on every use**.

That design buys three things a bare JWT pair cannot:

1. **Logout genuinely revokes** — the stored session is deleted.
2. **Reuse detection** — presenting an already-rotated refresh token revokes *every*
   session for that account, on the assumption the token was stolen.
3. **Password changes invalidate everything** — both via session clearing and a
   `passwordChangedAt` check on every authenticated request.

Every authenticated request also re-checks live account state, so a deleted or
deactivated account loses access immediately rather than when its token expires.

| Role | Access |
| --- | --- |
| `instructor` | Full administrative access to every module |
| `student` | Own profile, own attendance/grades/payments/reports, and content for collections they are enrolled in |

**Endpoints:** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`,
`/auth/forgot-password`, `/auth/reset-password`, `PATCH /auth/change-password`,
`GET /auth/me`, `GET /auth/sessions`.

---

## Student registration flow

`activationCode` is **optional** on `POST /auth/register`. Two paths lead to the same
outcome — a `pending` account awaiting instructor approval:

```
                       ┌─────────────────────────────┐
                       │   POST /auth/register        │
                       └──────────────┬────────────────┘
                                      │
                    activationCode provided?
                     ┌────────yes─────┴────no─────────┐
                     ▼                                 ▼
     Redeem the instructor-issued code       Generate + immediately consume
     (validated, claimed atomically,          a fresh code of its own
      inherits its educationLevel/            (issuedBy: null, notes:
      collection binding, auto-enrols)         "auto-generated…")
                     │                                 │
                     └────────────────┬────────────────┘
                                      ▼
                     Account created with status: pending
                        (can sign in, but no content access)
                                      │
                                      ▼  PATCH /students/{id}/approve
                        Instructor approves → status: active
                              (approval email sent)
                                      │
                                      ▼
                  Student has full access to their collections
```

Either way, the code — instructor-issued or auto-generated — is a real
`ActivationCode` document, so it shows up in `GET /activation-codes` for the
instructor. Auto-generated entries are distinguishable by `issuedBy: null` and a
`notes` field explaining they were system-generated; this keeps every registration
auditable from one screen without requiring the instructor to pre-issue anything.

**With a code:** it must be valid, unused and unexpired. Claiming is a conditional
atomic update, so two concurrent registrations racing on the same code cannot both
succeed. A code may optionally be bound to an email (restricting who can redeem it,
and mailing the code out) and/or a collection (auto-enrolling the student on
registration) — supplying a bound code lets `educationLevel` be inherited rather than
typed again.

**Without a code:** `educationLevel` must be supplied directly in the request body,
since there is no code to inherit it from. No collection binding happens — the
instructor enrols the student into collections after approval.

**Instructor-side codes remain unchanged:** `POST /activation-codes` (issue, optionally
bulk, optionally bound to an email/collection), `GET /activation-codes/verify/{code}`
(public pre-check), revoke, extend and statistics all work exactly as before — this
only changes what happens when a student registers *without* one.

If account creation fails after either path claims/generates a code, that code's
record is rolled back — released back to `unused` for an instructor-issued code, or
hard-deleted for an auto-generated one — so a failed attempt never leaves a burned
code or an orphaned audit entry.

---

## API conventions

### Response envelope

```jsonc
// Success
{ "success": true, "message": "...", "data": {}, "meta": {}, "timestamp": "..." }

// Error
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

### Querying lists

Every list endpoint supports the same grammar:

| Feature | Example |
| --- | --- |
| Pagination | `?page=2&limit=25` (limit capped at 100) |
| Sorting | `?sort=-createdAt,fullName` (`-` = descending) |
| Search | `?search=ali` — case-insensitive across that resource's text fields |
| Filtering | `?status=active&educationLevel=secondary-2` |
| Ranges | `?score[gte]=50&examDate[lt]=2026-09-01` |
| Set membership | `?examType[in]=quiz,midterm` |
| Projection | `?fields=fullName,age` |

Only whitelisted fields ever reach the database, and search terms are regex-escaped — so
neither operator injection nor a ReDoS-shaped input can get through.

Pagination metadata:

```json
{ "meta": { "pagination": {
  "total": 132, "count": 20, "page": 1, "limit": 20,
  "totalPages": 7, "hasPreviousPage": false, "hasNextPage": true
} } }
```

### Status codes

`200` OK · `201` created · `400` bad request/business-rule violation · `401`
unauthenticated · `403` wrong role or not your record · `404` not found · `409` conflict ·
`413` payload too large · `415` unsupported file type · `422` validation failed ·
`429` rate limited · `500` unexpected.

---

## Endpoint map

Full request/response schemas, examples and error cases live in Swagger at `/docs`
(119 paths, 157 operations). Summary:

| Module | Base path | Highlights |
| --- | --- | --- |
| Auth | `/auth` | login, refresh, logout, change/forgot/reset password, sessions |
| Activation codes | `/activation-codes` | issue (single or bulk), public verify, revoke, extend, statistics |
| Students | `/students` | CRUD, search/filter/sort/paginate, approve, notes, performance, profile image |
| Collections | `/collections` | CRUD, subjects list, schedule validation |
| Enrolment | `/collections/{id}/students` | add (single/bulk), remove, list, search inside collection, suspend |
| Lessons | `/lessons` | upload, update (with file replacement), list by collection, download, purge |
| Homework | `/homework` | CRUD, attachments, by collection, upcoming, student view |
| Attachments | `/attachments` | upload, update, delete, list by collection, download |
| Attendance | `/attendance` | student submit, instructor record/bulk/review, summaries, recalculate |
| Grades | `/grades` | CRUD, bulk entry, per-student and per-collection summaries, upcoming exams |
| Payments | `/payments` | record, mark paid/late, reverse, generate monthly invoices, summary |
| Revenues | `/revenues` | CRUD, overview, monthly total, series, categories |
| Expenses | `/expenses` | CRUD, overview, monthly total, series, categories |
| Finance | `/finance` | total revenue/expenses, net profit, monthly series, category breakdown |
| Reports | `/reports` | per-student JSON report, PDF export, archive, history |
| Notifications | `/notifications` | list, summary, mark read, delete |
| Settings | `/settings` | instructor profile, institution details, preferences, profile image, password |
| Dashboard | `/dashboard` | full statistics, quick stats, action items, trends, recent activity |

---

## Business rules

These are enforced in the service layer, so no endpoint can route around them.

**Attendance.** A student submits attendance (`pending`); the instructor confirms
`present` or marks `absent`. One record per student, per collection, per day, enforced by
a unique index on a UTC-normalised date. Percentage is
`present ÷ (present + absent)` — pending records are excluded, because a submission
awaiting review should not count against the student. Every write that changes those
totals recomputes the cached roll-up and re-evaluates the rule:

> **Attendance below `ATTENDANCE_WARNING_THRESHOLD` (default 50%) generates a warning
> notification** to the student and to every instructor. Notifications are deduplicated
> per student, so re-evaluation refreshes the alert rather than flooding the inbox.

**Payments.** Status is derived, never trusted from the client. An unpaid item whose due
date has passed is swept to `late` on every read path, so the system stays correct without
depending on a scheduler being alive. Settling a payment mirrors it into the revenue
ledger; reversing or deleting it removes that entry, so the financial summary can never
double-count. Monthly invoice generation is idempotent.

**Grades.** `score` may not exceed `totalScore` (validated at both the schema and service
layers). Averages are score-weighted — `total scored ÷ total possible` — so a 50-mark
final counts more than a 5-mark quiz, which a mean-of-percentages would get wrong.

**Enrolment.** Only approved students can be enrolled; capacity is enforced when set. A
student appears at most once per collection (unique partial index), and re-enrolling
after removal reuses the tombstoned row rather than colliding with it.

**Deletion.** Soft delete throughout. Removing a student cascades to their login account
and enrolments but *retains* grades, attendance and payments, so academic and financial
history stays auditable.

**Notifications.** Generated automatically for: attendance below threshold, late
payments, pending attendance approval, new homework, upcoming exams, and pending student
approval. Emission is failure-tolerant — a notification problem never rolls back the
business action that triggered it.

---

## Data model

16 collections, all with timestamps, indexes on searchable fields, and soft delete where
appropriate.

```
User ──1:1── Student ──*:*── Collection        (via CollectionStudent)
 │              │                │
 │              │                ├── Lesson
 │              │                ├── Homework
 │              │                └── Attachment
 │              │
 │              ├── Attendance ──┤
 │              ├── Grade ───────┤
 │              ├── Payment ─────┘ ──→ Revenue
 │              └── Report
 │
 ├── ActivationCode (issued / redeemed)
 ├── Notification
 └── Setting

Expense (standalone ledger)
```

**Two deliberate denormalisations**, each with a single writer that keeps it in sync:

- `Student.fullName / email / phone` mirror the linked `User`. Student search, sorting and
  reporting all run against `Student`; a `$lookup` on every list query would dominate the
  cost. `StudentService` is the only writer of both.
- `Student.collections[]` and `Collection.studentsCount` cache the enrolment join.
  `CollectionStudent` remains authoritative (it carries enrolment metadata);
  `CollectionStudentService` is the only writer of all three, and
  `GET /collections/{id}` self-heals the counter if it ever drifts.

---

## File storage

Uploads accept PDF, images, Word, PowerPoint, spreadsheets and video, validated by MIME
type **and** extension, capped at `UPLOAD_MAX_FILE_SIZE_MB`.

Two drivers behind one interface:

- **`local`** (default) — zero-config; files served under `/uploads` and streamed through
  the API on download so authorisation is enforced on every request.
- **`cloudinary`** — set `STORAGE_DRIVER=cloudinary` plus credentials. Downloads become a
  302 redirect to the provider. If credentials are incomplete the app logs a warning and
  falls back to local rather than failing at upload time.

Storage writes are transactional-ish by hand: if the database write fails after an upload,
the blob is removed; when replacing a file, the old one is deleted only after the new
record is safely persisted.

---

## Security

| Measure | Implementation |
| --- | --- |
| Password hashing | bcrypt, 12 rounds, hashed in a schema hook so no code path can store plaintext |
| JWT | Separate access/refresh secrets, issuer/audience claims, rotation, reuse detection |
| RBAC | Route-level `authorize()` plus record-level ownership checks in services |
| Validation | Zod on body, params and query; parsed values replace the raw input |
| NoSQL injection | `express-mongo-sanitize` + operator whitelisting in the query builder |
| Regex safety | All search input is regex-escaped before it becomes a `RegExp` |
| Headers | Helmet |
| CORS | Configurable allow-list |
| Rate limiting | Global, plus stricter limits on auth endpoints (keyed by IP + email) and uploads |
| HPP | Duplicate query parameters collapsed |
| Uploads | MIME + extension whitelist, size caps, sanitised filenames, path-traversal guard |
| Account enumeration | Login and forgot-password return identical responses for unknown accounts |
| Error leakage | Stack traces and internal messages suppressed in production |
| Secrets | Environment only, validated at boot; never returned by any endpoint |

---

## Configuration

All variables are documented in [`.env.example`](.env.example). The ones that matter most:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `MONGODB_URI` | — | **Required** |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | **Required**, ≥ 16 chars, must differ |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `ATTENDANCE_WARNING_THRESHOLD` | `50` | Percentage below which warnings fire |
| `ACTIVATION_CODE_EXPIRES_IN_DAYS` | `14` | Activation code validity |
| `STORAGE_DRIVER` | `local` | `local` or `cloudinary` |
| `UPLOAD_MAX_FILE_SIZE_MB` | `100` | Per-file upload cap |
| `CORS_ORIGINS` | `*` | Comma-separated allow-list |
| `RATE_LIMIT_MAX_REQUESTS` | `300` | Per window, per IP |
| `SMTP_HOST` | *(empty)* | Leave empty to log emails instead of sending |

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] Strong, distinct JWT secrets (`openssl rand -hex 32`)
- [ ] Change the seeded instructor password
- [ ] `CORS_ORIGINS` set to your real front-end origins, not `*`
- [ ] SMTP configured (password reset and approval emails)
- [ ] `STORAGE_DRIVER=cloudinary` (local disk does not survive most deploys)
- [ ] Build indexes once — `autoIndex` is disabled in production
- [ ] Run behind TLS; `trust proxy` is enabled in production for correct client IPs

---

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the server |
| `npm run dev` | Start with nodemon |
| `npm run seed` | Create the bootstrap instructor account |
| `npm run seed -- --demo` | Also seed demo collections, students and activation codes |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` | Prettier |

---

## License

MIT
