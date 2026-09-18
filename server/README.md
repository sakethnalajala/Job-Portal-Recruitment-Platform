# Job Portal API (server)

Express + TypeScript + Mongoose REST API for the Job Portal & Recruitment Platform.

## Quick start

```bash
cd server
npm install
cp .env.example .env        # then fill in MONGODB_URI and the two JWT secrets
npm run dev                 # http://localhost:5000/api/v1
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the admin account (the only way an admin exists):

```bash
# set ADMIN_EMAIL / ADMIN_PASSWORD in .env first
npm run seed:admin
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` and run (what Render uses) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest + Supertest against an in-memory MongoDB (no Atlas needed) |
| `npm run seed:admin` | Create/update the platform admin from env |
| `npm run seed:demo` | Load Indian tech-market demo data (8 companies, ~30 jobs, 12 candidates, applications). `-- --wipe` removes it. Password for demo accounts: `Demo@1234` |

> Windows note: `.npmrc` runs npm scripts through Git Bash because the workspace path contains `&`, which breaks `cmd.exe`-based scripts. It is ignored on macOS/Linux/Render.

## Layout

```
src/
  config/      env (Zod-validated, fails fast), db, logger, cloudinary
  models/      Mongoose schemas + indexes (all domain models)
  middleware/  authenticate, authorize, validate, rateLimit, upload, errorHandler
  modules/     one folder per domain: routes → controller → service → validation
  services/    email (console | Resend), storage (Cloudinary)
  utils/       AppError, ApiResponse, asyncHandler, pagination, constants
  app.ts       express app assembly
  server.ts    bootstrap + graceful shutdown
scripts/       seedAdmin, seedDemo
tests/         vitest suites
```

## Response envelope

```jsonc
// success
{ "success": true, "message": "OK", "data": { ... }, "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [{ "field": "body.email", "message": "..." }] } }
```

Stack traces are never returned in production.

## Authentication model

- **Access token**: JWT (HS256), 15 min, returned in JSON; the client keeps it in memory and sends `Authorization: Bearer …`.
- **Refresh token**: opaque random value in an `httpOnly` `SameSite=Lax` cookie scoped to `/api/v1/auth`; stored **hashed** in `refreshtokens`; **rotated on every refresh**. Reuse of a rotated token revokes the whole token family.
- `authenticate` re-reads the user on every request so suspension / deletion / password changes take effect immediately.
- Roles are bound to the registration route (`/auth/register/candidate`, `/auth/register/recruiter`). Admin exists only via `seed:admin`.
- Email verification and password reset use single-use hashed tokens with expiry.

## Auth endpoints (`/api/v1/auth`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register/candidate` | – | 201, sets refresh cookie, sends verification email |
| POST | `/register/recruiter` | – | requires `companyName` |
| POST | `/login` | – | 10 attempts / 15 min per ip+email |
| POST | `/refresh` | cookie | rotates refresh token |
| POST | `/logout` | cookie | revokes current session |
| POST | `/logout-all` | bearer | revokes all sessions |
| GET | `/me` | bearer | user + profile summary |
| PATCH | `/change-password` | bearer | revokes other sessions, returns a new session |
| POST | `/forgot-password` | – | always 200 |
| POST | `/reset-password` | – | `{ token, password }` |
| POST | `/verify-email` | – | `{ token }` |
| POST | `/resend-verification` | – | always 200 |

`GET /api/v1/health` reports DB / storage / email status (used by Render).

## All other endpoints

See [docs/API.md](../docs/API.md) for the full reference (candidates, recruiters, jobs, applications, notifications, stats, admin). Module layout:

| Module | Mount | Highlights |
|---|---|---|
| `candidates` | `/candidates` | profile, photo, resumes (private Cloudinary + signed URLs), recruiter/admin candidate view |
| `recruiters` | `/recruiters` | company profile, logo, public company card |
| `jobs` | `/jobs` | CRUD + lifecycle, `$text` search with filters, recommendations, saved jobs, reporting, applicant pipeline |
| `applications` | `/applications` | apply (multipart/JSON), status workflow with interview details, withdraw, private notes |
| `notifications` | `/notifications` | in-app inbox |
| `stats` | `/stats` | candidate / recruiter dashboards |
| `admin` | `/admin` | users, suspension, soft delete, recruiter verification, job moderation, reports, audit logs, platform stats |
| `users` | `/users` | self-service soft account deletion |

## Demo walkthrough (after `npm run seed:demo`)

| Account | Email | Try |
|---|---|---|
| Candidate | `asha.verma@demo.jobportal.in` | `GET /jobs/recommended`, `GET /applications/me`, `GET /stats/candidate` |
| Recruiter | `hr.zyntra-labs@demo.jobportal.in` | `GET /jobs/mine`, `GET /jobs/:id/applications`, `PATCH /applications/:id/status` |
| Admin | your `ADMIN_EMAIL` (`npm run seed:admin`) | `GET /admin/stats`, `GET /admin/reports?status=pending`, `PATCH /admin/jobs/:id/moderate` |

## Testing with Postman

Import `postman/JobPortal.postman_collection.json` and `postman/Local.postman_environment.json`. The collection captures the access token automatically; the refresh cookie lives in Postman's cookie jar. With `EMAIL_PROVIDER=console`, verification and reset links are printed in the server log.
