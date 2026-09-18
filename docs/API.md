# Job Portal API Reference

Base URL: `/api/v1` · All responses use the envelope below · Auth = `Authorization: Bearer <accessToken>`

```jsonc
{ "success": true,  "message": "OK", "data": { … }, "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "field": "body.email", "message": "…" }] } }
```

Roles: **C** candidate · **R** recruiter · **A** admin · **✉** requires verified email · **★** ownership enforced

## Auth — `/auth`

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/register/candidate` | – | `{ fullName, email, password }` → 201 + session |
| POST | `/register/recruiter` | – | `{ fullName, email, password, companyName }` |
| POST | `/login` | – | 10 attempts / 15 min per ip+email |
| POST | `/refresh` | cookie | rotates `jp_refresh` cookie |
| POST | `/logout` · `/logout-all` | cookie / any | |
| GET | `/me` | any | user + profile summary |
| PATCH | `/change-password` | any | revokes other sessions, returns new session |
| POST | `/forgot-password` · `/reset-password` | – | `{ email }` / `{ token, password }` |
| POST | `/verify-email` · `/resend-verification` | – | `{ token }` / `{ email }` |

## Candidate profile — `/candidates`

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/me` | C | profile + email + completion % + active resume |
| PATCH | `/me` | C | strict partial update (fullName, phone, headline, bio, location, skills[], education[], experience[], certifications[], totalExperienceYears, preferredWorkTypes[], portfolioUrl, linkedinUrl, githubUrl) |
| POST / DELETE | `/me/photo` | C | multipart `photo` (PNG/JPEG/WebP ≤ 2 MB, magic bytes checked) |
| GET | `/me/resumes` | C | max 5 live resumes |
| POST | `/me/resumes` | C | multipart `resume` (PDF ≤ 5 MB) + `setActive` |
| PATCH | `/me/resumes/:id/activate` | C | |
| GET | `/me/resumes/:id/download` | C | 15-min signed URL |
| DELETE | `/me/resumes/:id` | C | hard-deletes if unused; soft-deletes if referenced by an application |
| GET | `/:userId` | R★ / A | recruiter only if the candidate applied to one of their jobs |

## Recruiter profile — `/recruiters`

| Method | Path | Who | Notes |
|---|---|---|---|
| GET / PATCH | `/me` | R | company profile (companyName, companyDescription, industry, website, companySize, location, phone); updates re-sync job snapshots |
| POST / DELETE | `/me/logo` | R | multipart `logo` |
| GET | `/:profileId` | – | public company card (no contact info) + open job count |

## Jobs — `/jobs`

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/` | – (C flags) | search: `q, location, company, workType[], employmentType[], experienceLevel[], skills[], salaryMin, salaryMax, postedWithin (days), includeExpired, sort (relevance|newest|oldest|salary_desc|salary_asc|deadline), page, limit≤50`. Arrays are comma-separated. Logged-in candidates get `hasApplied`, `applicationStatus`, `isSaved`. |
| GET | `/recommended` | C | rule-based: required-skill ×3, preferred ×1, same city +2, work-type +1, level +1, verified +0.5; excludes applied; returns `matchedSkills`, `matchScore`, `basis` |
| GET | `/saved` | C | |
| GET | `/mine` | R | `status[], q, sort (newest|oldest|applicants)` |
| POST | `/` | R (✉ to publish) | `status: draft|open`; snapshot of company name/logo/verified |
| GET | `/:id` | – | open/closed public; draft/paused/removed only owner/admin; increments `viewCount` for non-owners; includes `company` card |
| PATCH | `/:id` | R★ | strict partial; `deadline: null` clears |
| PATCH | `/:id/status` | R★ | `open|paused|closed`; draft→open, open⇄paused, open/paused→closed, closed→open (needs future deadline, ✉); closing notifies active applicants |
| DELETE | `/:id` | R★ | only drafts or jobs with 0 applications (else 409 `JOB_HAS_APPLICATIONS`) |
| GET | `/:id/applications` | R★ | pipeline: `status[], sort (newest|oldest|rating)` + `statusCounts` |
| POST | `/:id/applications` | C ✉ | **apply** — multipart (`resume` file optional, `coverLetter`, `answers` JSON string) or JSON (`resumeId` / active resume). Validates required custom questions, select options, boolean answers. 409 `ALREADY_APPLIED`, 400 `JOB_NOT_ACCEPTING`, 400 `RESUME_REQUIRED` |
| POST / DELETE | `/:id/save` | C | idempotent |
| POST | `/:id/report` | C | `{ reason: spam|scam|misleading|discriminatory|other, details? }` once per job |

## Applications — `/applications`

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/me` | C | `status[]`, paginated, with job cards |
| GET | `/:id` | C★ / R★ / A | candidate view omits recruiter notes/rating/signed URL; recruiter/admin view adds candidate summary, signed resume URL, `allowedTransitions` |
| PATCH | `/:id/status` | R★ | `{ status, note?, interview? }` — `interview` (scheduledAt, mode, location/meetingLink, notes) **required** when status = `interview`. Transitions: applied→under_review/shortlisted/rejected · under_review→shortlisted/rejected · shortlisted→interview/rejected · interview→selected/rejected. Notifies + emails candidate. |
| PATCH | `/:id/notes` | R★ | `{ recruiterNotes?, rating? (1–5|null) }` private |
| PATCH | `/:id/withdraw` | C★ | from applied/under_review/shortlisted/interview; decrements job count; notifies recruiter |

## Notifications — `/notifications`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | `unreadOnly, page, limit`; `meta.unreadCount` |
| GET | `/unread-count` | |
| PATCH | `/:id/read` · `/read-all` | |
| DELETE | `/:id` | |

## Stats — `/stats`

| Path | Who | Returns |
|---|---|---|
| `/candidate` | C | applications by status, saved count, unread, profile completion, recent applications |
| `/recruiter` | R | jobs by status, applications by status, applications/day (30d), total views, conversion %, top jobs |

## Admin — `/admin` (A only, every action audited)

| Method | Path | Notes |
|---|---|---|
| GET | `/stats` | users by role/status, jobs by status, applications by status, signups + applications per day (30d), pending reports, verified recruiters, top skills |
| GET | `/users` | `role[], status[], q (email/name/company), sort` |
| GET | `/users/:id` | detail + counts + audit trail |
| PATCH | `/users/:id/status` | `{ status: active|suspended, reason? }` — suspension revokes sessions + emails user |
| DELETE | `/users/:id` | soft delete: closes jobs / withdraws applications, keeps row |
| PATCH | `/recruiters/:profileId/verify` | `{ isVerified, reason? }` — flags jobs, notifies + emails |
| GET | `/jobs` | `status[], q, recruiter, reported=true` with `pendingReports` per job |
| PATCH | `/jobs/:id/moderate` | `{ action: remove|restore, reason? }` — remove hides job, locks owner out, auto-resolves pending reports; restore → `closed` |
| GET | `/reports` | `status[]` with target + reporter |
| PATCH | `/reports/:id` | `{ status: reviewed|action_taken|dismissed, resolutionNote? }` |
| GET | `/audit-logs` | `action[], actor` |

## Account — `/users`

| Method | Path | Notes |
|---|---|---|
| DELETE | `/me` | `{ password, confirmation: "DELETE" }` — soft delete (not for admins) |

## Error codes you will see

`VALIDATION_ERROR` `INVALID_ID` `NO_TOKEN` `TOKEN_EXPIRED` `INVALID_TOKEN` `TOKEN_STALE` `ACCOUNT_SUSPENDED` `ACCOUNT_NOT_FOUND` `FORBIDDEN` `EMAIL_NOT_VERIFIED` `EMAIL_TAKEN` `INVALID_CREDENTIALS` `RATE_LIMITED` `JOB_NOT_FOUND` `JOB_REMOVED` `JOB_EXPIRED` `JOB_NOT_ACCEPTING` `JOB_HAS_APPLICATIONS` `INVALID_STATUS_TRANSITION` `ALREADY_APPLIED` `RESUME_REQUIRED` `RESUME_NOT_FOUND` `RESUME_LIMIT` `NOT_WITHDRAWABLE` `ALREADY_REPORTED` `ADMIN_PROTECTED` `NO_CHANGE` `INVALID_FILE_TYPE` `FILE_TOO_LARGE` `STORAGE_UNAVAILABLE` `ROUTE_NOT_FOUND`
