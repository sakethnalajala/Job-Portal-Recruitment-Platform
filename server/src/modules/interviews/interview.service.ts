import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { Application } from '../../models/Application';
import { CandidateProfile } from '../../models/CandidateProfile';
import { Interview, INTERVIEW_OUTCOMES, INTERVIEW_STATUSES, type InterviewAttrs } from '../../models/Interview';
import { Job } from '../../models/Job';
import { User } from '../../models/User';
import { sendPreferredEmail } from '../../services/email/email.service';
import { notify } from '../../services/notification.service';
import { getRecruiterScope } from '../../services/team.service';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import { INTERVIEW_MODES } from '../../utils/constants';
import { buildMeta, paginationQuerySchema, toSkip } from '../../utils/pagination';
import { csvEnum, objectIdSchema, optionalTrimmed } from '../../utils/validation';
import { loadOwnedApplication } from '../applications/application.service';

// ─── validation ────────────────────────────────────────────────────────────

const future = z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, 'Interview time must be in the future');
const detailsShape = {
  title: optionalTrimmed(120),
  scheduledAt: future,
  durationMinutes: z.number().int().min(5).max(480).default(60),
  mode: z.enum(INTERVIEW_MODES),
  location: optionalTrimmed(300),
  meetingLink: z.string().trim().url().max(500).or(z.literal('')).optional().transform((v) => (v === '' ? undefined : v)),
  notes: optionalTrimmed(2000),
};
const needsLocation = { message: 'Add a location for an in-person interview', path: ['location'] };
export const scheduleSchema = z.object({ applicationId: objectIdSchema, ...detailsShape }).refine((v) => v.mode !== 'onsite' || Boolean(v.location), needsLocation);
export const rescheduleSchema = z.object({ ...detailsShape, reason: optionalTrimmed(500) }).partial({ mode: true, scheduledAt: true, durationMinutes: true });
export const statusSchema = z.object({
  status: z.enum(['completed', 'cancelled', 'no_show']),
  outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
  feedback: optionalTrimmed(3000),
  reason: optionalTrimmed(500),
});
export const feedbackSchema = z.object({ feedback: optionalTrimmed(3000), outcome: z.enum(INTERVIEW_OUTCOMES).optional() });
export const listSchema = paginationQuerySchema.extend({
  status: csvEnum(INTERVIEW_STATUSES).optional(),
  job: objectIdSchema.optional(),
  candidate: objectIdSchema.optional(),
  range: z.enum(['upcoming', 'past', 'today', 'week', 'all']).default('upcoming'),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
export type ListQuery = z.infer<typeof listSchema>;

type InterviewLean = InterviewAttrs & { _id: Types.ObjectId };
const ACTIVE = ['scheduled', 'rescheduled'] as const;

// ─── serializers ───────────────────────────────────────────────────────────

function serialize(i: InterviewLean, extra: { candidate?: { fullName: string; email?: string; headline?: string | null; photoUrl: string | null } | null; job?: { title: string; companyName: string } | null; forCandidate?: boolean } = {}) {
  return {
    id: i._id.toString(),
    applicationId: i.application.toString(),
    jobId: i.job.toString(),
    candidateId: i.candidate.toString(),
    round: i.round,
    title: i.title,
    scheduledAt: i.scheduledAt,
    endsAt: new Date(i.scheduledAt.getTime() + (i.durationMinutes ?? 60) * 60_000),
    durationMinutes: i.durationMinutes,
    mode: i.mode,
    location: i.location ?? null,
    meetingLink: i.meetingLink ?? null,
    notes: i.notes ?? null,
    status: i.status,
    outcome: i.outcome,
    ...(extra.forCandidate ? {} : { feedback: i.feedback ?? null, reminderSentAt: i.reminderSentAt ?? null, history: i.history.map((h) => ({ action: h.action, at: h.at, note: h.note ?? null })) }),
    cancelledReason: i.cancelledReason ?? null,
    isUpcoming: ACTIVE.includes(i.status as (typeof ACTIVE)[number]) && i.scheduledAt.getTime() >= Date.now(),
    createdAt: i.createdAt,
    candidate: extra.candidate ?? undefined,
    job: extra.job ?? undefined,
  };
}

async function decorate(items: InterviewLean[], forCandidate = false) {
  const candidateIds = [...new Set(items.map((i) => i.candidate.toString()))].map((id) => new Types.ObjectId(id));
  const jobIds = [...new Set(items.map((i) => i.job.toString()))].map((id) => new Types.ObjectId(id));
  const [profiles, users, jobs] = await Promise.all([
    forCandidate ? [] : CandidateProfile.find({ user: { $in: candidateIds } }).select('user fullName headline photoPublicId').lean(),
    forCandidate ? [] : User.find({ _id: { $in: candidateIds } }).select('email').lean(),
    Job.find({ _id: { $in: jobIds } }).select('title companyName').lean(),
  ]);
  const pBy = new Map(profiles.map((p) => [p.user.toString(), p]));
  const eBy = new Map(users.map((u) => [u._id.toString(), u.email]));
  const jBy = new Map(jobs.map((j) => [j._id.toString(), j]));
  return items.map((i) => {
    const p = pBy.get(i.candidate.toString());
    const j = jBy.get(i.job.toString());
    return serialize(i, {
      forCandidate,
      candidate: p ? { fullName: p.fullName, email: eBy.get(i.candidate.toString()), headline: p.headline ?? null, photoUrl: storageService.getImageUrl(p.photoPublicId) } : null,
      job: j ? { title: j.title, companyName: j.companyName } : null,
    });
  });
}

/** Mirror the latest active round onto the application so candidate views stay in sync. */
async function syncApplication(applicationId: Types.ObjectId) {
  const latest = await Interview.findOne({ application: applicationId, status: { $in: ACTIVE } }).sort({ scheduledAt: -1 }).lean();
  await Application.updateOne({ _id: applicationId }, latest
    ? { $set: { interview: { scheduledAt: latest.scheduledAt, mode: latest.mode, location: latest.location, meetingLink: latest.meetingLink, notes: latest.notes, durationMinutes: latest.durationMinutes } } }
    : { $unset: { interview: 1 } });
}

const fmtWhen = (d: Date) => `${d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} (IST)`;

async function notifyCandidate(i: InterviewLean, kind: 'scheduled' | 'rescheduled' | 'cancelled' | 'reminder') {
  const [job, user, profile] = await Promise.all([
    Job.findById(i.job).select('title companyName').lean(),
    User.findById(i.candidate).select('email').lean(),
    CandidateProfile.findOne({ user: i.candidate }).select('fullName').lean(),
  ]);
  if (!job || !user) return;
  const link = `/candidate/applications/${i.application}`;
  const when = fmtWhen(i.scheduledAt);
  const copy = {
    scheduled: { title: 'Interview scheduled', message: `${job.companyName} scheduled a ${i.mode} interview for ${job.title} on ${when}.` },
    rescheduled: { title: 'Interview rescheduled', message: `Your interview for ${job.title} at ${job.companyName} was moved to ${when}.` },
    cancelled: { title: 'Interview cancelled', message: `${job.companyName} cancelled your interview for ${job.title}${i.cancelledReason ? `: ${i.cancelledReason}` : '.'}` },
    reminder: { title: 'Interview reminder', message: `Reminder: your interview for ${job.title} at ${job.companyName} is on ${when}.` },
  }[kind];
  void notify(i.candidate, { type: 'interview_scheduled', ...copy, link, meta: { jobId: i.job, applicationId: i.application } });
  if (kind !== 'cancelled') {
    void sendPreferredEmail(i.candidate, 'interviewScheduled', user.email, {
      name: profile?.fullName ?? 'there', jobTitle: job.title, company: job.companyName, when, mode: i.mode,
      where: i.meetingLink ?? i.location ?? undefined, notes: kind === 'reminder' ? `Reminder — ${i.notes ?? ''}`.trim() : i.notes ?? undefined,
      url: `${env.CLIENT_URL}${link}`,
    });
  }
}

// ─── recruiter operations ──────────────────────────────────────────────────

export async function schedule(recruiter: Express.AuthUser, input: ScheduleInput) {
  const app = await loadOwnedApplication(input.applicationId, recruiter.id);
  if (['rejected', 'withdrawn', 'selected'].includes(app.status)) {
    throw AppError.badRequest(`Cannot schedule an interview for an application that is ${app.status}`, 'INVALID_STATUS_TRANSITION');
  }
  const round = (await Interview.countDocuments({ application: app._id })) + 1;
  const doc = await Interview.create({
    application: app._id, job: app.job, candidate: app.candidate, recruiter: app.recruiter, scheduledBy: recruiter.id,
    round, title: input.title ?? (round > 1 ? `Round ${round} interview` : 'Interview'),
    scheduledAt: input.scheduledAt, durationMinutes: input.durationMinutes, mode: input.mode, location: input.location, meetingLink: input.meetingLink, notes: input.notes,
    history: [{ action: 'scheduled', by: recruiter.id }],
  });

  // Move the application into the interview stage (from applied/under_review/shortlisted).
  if (app.status !== 'interview') {
    app.status = 'interview';
    app.statusHistory.push({ status: 'interview', changedBy: new Types.ObjectId(recruiter.id), changedAt: new Date(), note: `Interview scheduled for ${fmtWhen(input.scheduledAt)}` });
    await app.save();
  }
  await syncApplication(app._id);
  void notifyCandidate(doc.toObject(), 'scheduled');
  return (await decorate([doc.toObject()]))[0]!;
}

async function loadInterview(id: string, recruiterId: string) {
  const i = await Interview.findById(id);
  if (!i) throw AppError.notFound('Interview not found', 'INTERVIEW_NOT_FOUND');
  await loadOwnedApplication(i.application.toString(), recruiterId); // enforces owner/team scope with 'review'
  return i;
}

export async function reschedule(recruiter: Express.AuthUser, id: string, input: RescheduleInput) {
  const i = await loadInterview(id, recruiter.id);
  if (!ACTIVE.includes(i.status as (typeof ACTIVE)[number])) throw AppError.badRequest('Only upcoming interviews can be edited', 'INTERVIEW_NOT_ACTIVE');
  const moved = input.scheduledAt && input.scheduledAt.getTime() !== i.scheduledAt.getTime();
  const { reason, ...rest } = input;
  const nextMode = input.mode ?? i.mode;
  const nextLocation = input.location !== undefined ? input.location : i.location;
  if (nextMode === 'onsite' && !nextLocation) throw AppError.badRequest('Add a location for an in-person interview', 'VALIDATION_ERROR', [{ field: 'body.location', message: 'Add a location for an in-person interview' }]);
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) i.set(k, v);
  if (moved) {
    i.status = 'rescheduled';
    i.history.push({ action: 'rescheduled', by: new Types.ObjectId(recruiter.id), note: reason });
  } else {
    i.history.push({ action: 'updated', by: new Types.ObjectId(recruiter.id), note: reason });
  }
  i.reminderSentAt = undefined;
  await i.save();
  await syncApplication(i.application);
  if (moved) void notifyCandidate(i.toObject(), 'rescheduled');
  return (await decorate([i.toObject()]))[0]!;
}

export async function setStatus(recruiter: Express.AuthUser, id: string, input: StatusInput) {
  const i = await loadInterview(id, recruiter.id);
  if (!ACTIVE.includes(i.status as (typeof ACTIVE)[number])) throw AppError.badRequest('This interview is already closed', 'INTERVIEW_NOT_ACTIVE');
  i.status = input.status;
  if (input.outcome) i.outcome = input.outcome;
  if (input.feedback !== undefined) i.feedback = input.feedback;
  if (input.status === 'cancelled') i.cancelledReason = input.reason;
  i.history.push({ action: input.status, by: new Types.ObjectId(recruiter.id), note: input.reason ?? input.feedback });
  await i.save();
  await syncApplication(i.application);
  if (input.status === 'cancelled') void notifyCandidate(i.toObject(), 'cancelled');
  return (await decorate([i.toObject()]))[0]!;
}

export async function saveFeedback(recruiter: Express.AuthUser, id: string, input: z.infer<typeof feedbackSchema>) {
  const i = await loadInterview(id, recruiter.id);
  if (input.feedback !== undefined) i.feedback = input.feedback;
  if (input.outcome) i.outcome = input.outcome;
  i.history.push({ action: 'feedback', by: new Types.ObjectId(recruiter.id) });
  await i.save();
  return (await decorate([i.toObject()]))[0]!;
}

export async function sendReminder(recruiter: Express.AuthUser, id: string) {
  const i = await loadInterview(id, recruiter.id);
  if (!ACTIVE.includes(i.status as (typeof ACTIVE)[number])) throw AppError.badRequest('Reminders can only be sent for upcoming interviews', 'INTERVIEW_NOT_ACTIVE');
  i.reminderSentAt = new Date();
  i.history.push({ action: 'reminder', by: new Types.ObjectId(recruiter.id) });
  await i.save();
  void notifyCandidate(i.toObject(), 'reminder');
  return { reminderSentAt: i.reminderSentAt };
}

export async function list(recruiterId: string, query: ListQuery) {
  const scope = await getRecruiterScope(recruiterId);
  const now = new Date();
  const filter: FilterQuery<InterviewAttrs> = { recruiter: { $in: scope.ownerIds } };
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.job) filter.job = query.job;
  if (query.candidate) filter.candidate = query.candidate;
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  if (query.range === 'upcoming') { filter.scheduledAt = { $gte: now }; if (!query.status?.length) filter.status = { $in: ACTIVE }; }
  else if (query.range === 'past') filter.scheduledAt = { $lt: now };
  else if (query.range === 'today') filter.scheduledAt = { $gte: startOfDay, $lt: endOfDay };
  else if (query.range === 'week') filter.scheduledAt = { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 7 * 86_400_000) };
  const sort: Record<string, 1 | -1> = query.range === 'past' ? { scheduledAt: -1 } : { scheduledAt: 1 };

  const [items, total, counts] = await Promise.all([
    Interview.find(filter).sort(sort).skip(toSkip(query)).limit(query.limit).lean<InterviewLean[]>(),
    Interview.countDocuments(filter),
    Interview.aggregate<{ _id: string; count: number }>([{ $match: { recruiter: { $in: scope.ownerIds } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const upcoming = await Interview.countDocuments({ recruiter: { $in: scope.ownerIds }, status: { $in: ACTIVE }, scheduledAt: { $gte: now } });
  const today = await Interview.countDocuments({ recruiter: { $in: scope.ownerIds }, status: { $in: ACTIVE }, scheduledAt: { $gte: startOfDay, $lt: endOfDay } });
  return { interviews: await decorate(items), summary: { upcoming, today, byStatus: Object.fromEntries(counts.map((c) => [c._id, c.count])) }, meta: buildMeta(query, total) };
}

export async function historyForApplication(recruiterId: string, applicationId: string) {
  await loadOwnedApplication(applicationId, recruiterId);
  const items = await Interview.find({ application: applicationId }).sort({ scheduledAt: -1 }).lean<InterviewLean[]>();
  return decorate(items);
}

// ─── candidate view ────────────────────────────────────────────────────────

export async function listForCandidate(candidateId: string) {
  const items = await Interview.find({ candidate: candidateId, status: { $ne: 'cancelled' } }).sort({ scheduledAt: -1 }).limit(50).lean<InterviewLean[]>();
  return decorate(items, true);
}

// ─── reminders (in-process scheduler) ──────────────────────────────────────

/** Sends a reminder for every upcoming interview inside the next 24h that has not been reminded yet. */
export async function runReminderSweep(): Promise<number> {
  const now = new Date();
  const due = await Interview.find({ status: { $in: ACTIVE }, scheduledAt: { $gte: now, $lte: new Date(now.getTime() + 24 * 3_600_000) }, reminderSentAt: null }).lean<InterviewLean[]>();
  for (const i of due) {
    await Interview.updateOne({ _id: i._id }, { $set: { reminderSentAt: now }, $push: { history: { action: 'reminder', note: 'automatic 24h reminder' } } });
    void notifyCandidate(i, 'reminder');
    void notify(i.recruiter, { type: 'interview_scheduled', title: 'Interview in the next 24 hours', message: `${i.title} on ${fmtWhen(i.scheduledAt)}.`, link: `/recruiter/interviews`, meta: { jobId: i.job, applicationId: i.application } });
  }
  if (due.length) logger.info({ count: due.length }, '[interviews] reminders sent');
  return due.length;
}

let timer: NodeJS.Timeout | undefined;
export function startReminderScheduler(intervalMs = 15 * 60_000) {
  if (timer || env.isTest) return;
  timer = setInterval(() => { runReminderSweep().catch((err) => logger.error({ err }, '[interviews] reminder sweep failed')); }, intervalMs);
  timer.unref();
  setTimeout(() => { runReminderSweep().catch(() => undefined); }, 10_000).unref();
}
