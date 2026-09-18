import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env';
import { Application } from '../../models/Application';
import { AuditLog } from '../../models/AuditLog';
import { CandidateProfile } from '../../models/CandidateProfile';
import { Job, type JobAttrs } from '../../models/Job';
import { RecruiterProfile } from '../../models/RecruiterProfile';
import { Report } from '../../models/Report';
import { User, type UserAttrs } from '../../models/User';
import { audit } from '../../services/audit.service';
import { sendEmail } from '../../services/email/email.service';
import { notify } from '../../services/notification.service';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import { buildMeta, toSkip } from '../../utils/pagination';
import { escapeRegex } from '../../utils/validation';
import { revokeAllUserSessions } from '../auth/token.service';
import { serializeJobCard, type JobLean } from '../jobs/job.service';
import type { AdminJobsQuery, AdminReportsQuery, AdminUsersQuery, AuditQuery } from './admin.validation';

interface Actor {
  id: string;
  ip?: string | undefined;
}

// ─── users ─────────────────────────────────────────────────────────────────

async function profileSummaries(users: Array<{ _id: Types.ObjectId; role: string }>) {
  const ids = users.map((u) => u._id);
  const [candidates, recruiters] = await Promise.all([
    CandidateProfile.find({ user: { $in: ids } }).select('user fullName photoPublicId completion').lean(),
    RecruiterProfile.find({ user: { $in: ids } }).select('user fullName companyName logoPublicId isVerified').lean(),
  ]);
  const map = new Map<string, Record<string, unknown>>();
  for (const c of candidates) {
    map.set(c.user.toString(), { fullName: c.fullName, photoUrl: storageService.getImageUrl(c.photoPublicId), completion: c.completion });
  }
  for (const r of recruiters) {
    map.set(r.user.toString(), {
      fullName: r.fullName,
      companyName: r.companyName,
      photoUrl: storageService.getImageUrl(r.logoPublicId),
      isVerified: r.isVerified,
      recruiterProfileId: r._id.toString(),
    });
  }
  return map;
}

function serializeUser(u: UserAttrs, profile: Record<string, unknown> | undefined) {
  return {
    id: u._id.toString(),
    email: u.email,
    role: u.role,
    status: u.status,
    isEmailVerified: u.isEmailVerified,
    lastLoginAt: u.lastLoginAt ?? null,
    deletedAt: u.deletedAt ?? null,
    createdAt: u.createdAt,
    profile: profile ?? (u.role === 'admin' ? { fullName: env.ADMIN_NAME } : null),
  };
}

export async function listUsers(query: AdminUsersQuery) {
  const filter: FilterQuery<UserAttrs> = {};
  if (query.role?.length) filter.role = { $in: query.role };
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.q) {
    const re = { $regex: escapeRegex(query.q), $options: 'i' };
    const [c, r] = await Promise.all([
      CandidateProfile.find({ fullName: re }).select('user').lean(),
      RecruiterProfile.find({ $or: [{ fullName: re }, { companyName: re }] }).select('user').lean(),
    ]);
    filter.$or = [{ email: re }, { _id: { $in: [...c, ...r].map((p) => p.user) } }];
  }
  const sort: Record<string, 1 | -1> =
    query.sort === 'oldest' ? { createdAt: 1 } : query.sort === 'lastLogin' ? { lastLoginAt: -1 } : { createdAt: -1 };

  const [users, total] = await Promise.all([
    User.find(filter).sort(sort).skip(toSkip(query)).limit(query.limit).lean(),
    User.countDocuments(filter),
  ]);
  const profiles = await profileSummaries(users);
  return { users: users.map((u) => serializeUser(u, profiles.get(u._id.toString()))), meta: buildMeta(query, total) };
}

export async function getUser(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  const profiles = await profileSummaries([user]);
  const [jobs, applications, recentAudit] = await Promise.all([
    user.role === 'recruiter' ? Job.countDocuments({ recruiter: user._id }) : 0,
    user.role === 'candidate' ? Application.countDocuments({ candidate: user._id }) : 0,
    AuditLog.find({ targetType: 'user', targetId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return {
    user: serializeUser(user, profiles.get(user._id.toString())),
    stats: { jobs, applications },
    auditTrail: recentAudit.map(serializeAudit),
  };
}

async function loadManagedUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  if (user.role === 'admin') throw AppError.forbidden('Administrator accounts cannot be modified here', 'ADMIN_PROTECTED');
  if (user.status === 'deleted') throw AppError.badRequest('This account has been deleted', 'USER_DELETED');
  return user;
}

async function nameOf(user: { _id: Types.ObjectId; role: string }) {
  if (user.role === 'candidate') return (await CandidateProfile.findOne({ user: user._id }).select('fullName').lean())?.fullName ?? 'there';
  return (await RecruiterProfile.findOne({ user: user._id }).select('fullName').lean())?.fullName ?? 'there';
}

export async function setUserStatus(actor: Actor, userId: string, status: 'active' | 'suspended', reason?: string) {
  const user = await loadManagedUser(userId);
  if (user.status === status) throw AppError.badRequest(`User is already ${status}`, 'NO_CHANGE');
  user.status = status;
  await user.save();

  if (status === 'suspended') {
    await revokeAllUserSessions(user._id.toString());
    void sendEmail('accountSuspended', user.email, { name: await nameOf(user), reason });
  }
  void audit({ actor: actor.id, action: status === 'suspended' ? 'user.suspend' : 'user.activate', targetType: 'user', targetId: user._id, reason, ip: actor.ip });
  return getUser(userId);
}

/** Soft delete: keeps rows for audit/history, but the account can never log in again. */
export async function softDeleteUser(actor: Actor, userId: string, reason?: string) {
  const user = await loadManagedUser(userId);
  await deactivateAccount(user._id, user.role);
  user.status = 'deleted';
  user.deletedAt = new Date();
  await user.save();
  void audit({ actor: actor.id, action: 'user.delete', targetType: 'user', targetId: user._id, reason, ip: actor.ip });
}

/** Shared with self-service deletion: revoke sessions, close jobs, withdraw applications. */
export async function deactivateAccount(userId: Types.ObjectId, role: string) {
  await revokeAllUserSessions(userId.toString());
  if (role === 'recruiter') {
    await Job.updateMany({ recruiter: userId, status: { $in: ['open', 'paused', 'draft'] } }, { $set: { status: 'closed', closedAt: new Date() } });
  }
  if (role === 'candidate') {
    await Application.updateMany(
      { candidate: userId, status: { $in: ['applied', 'under_review', 'shortlisted', 'interview'] } },
      { $set: { status: 'withdrawn', withdrawnAt: new Date() }, $push: { statusHistory: { status: 'withdrawn', changedBy: userId, changedAt: new Date(), note: 'Account deleted' } } },
    );
  }
}

// ─── recruiter verification ────────────────────────────────────────────────

export async function setRecruiterVerification(actor: Actor, profileId: string, isVerified: boolean, reason?: string) {
  const profile = await RecruiterProfile.findById(profileId);
  if (!profile) throw AppError.notFound('Recruiter profile not found', 'PROFILE_NOT_FOUND');
  if (profile.isVerified === isVerified) throw AppError.badRequest(`Recruiter is already ${isVerified ? 'verified' : 'unverified'}`, 'NO_CHANGE');

  profile.isVerified = isVerified;
  profile.verifiedAt = isVerified ? new Date() : undefined;
  profile.verifiedBy = isVerified ? new Types.ObjectId(actor.id) : undefined;
  await profile.save();
  await Job.updateMany({ recruiter: profile.user }, { $set: { companyVerified: isVerified } });

  if (isVerified) {
    const user = await User.findById(profile.user).select('email').lean();
    void notify(profile.user, {
      type: 'recruiter_verified',
      title: 'Company verified',
      message: `${profile.companyName} is now a verified employer.`,
      link: '/recruiter/profile',
    });
    if (user) void sendEmail('recruiterVerified', user.email, { name: profile.fullName, company: profile.companyName, url: `${env.CLIENT_URL}/recruiter` });
  }
  void audit({ actor: actor.id, action: isVerified ? 'recruiter.verify' : 'recruiter.unverify', targetType: 'recruiterProfile', targetId: profile._id, reason, ip: actor.ip });
  return { id: profile._id.toString(), isVerified: profile.isVerified, verifiedAt: profile.verifiedAt ?? null };
}

// ─── jobs ──────────────────────────────────────────────────────────────────

export async function listJobs(query: AdminJobsQuery) {
  const filter: FilterQuery<JobAttrs> = {};
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.recruiter) filter.recruiter = query.recruiter;
  if (query.q) {
    const re = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ title: re }, { companyName: re }];
  }
  if (query.reported) {
    const reported = await Report.distinct('targetId', { targetType: 'job', status: 'pending' });
    filter._id = { $in: reported };
  }
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit).lean<JobLean[]>(),
    Job.countDocuments(filter),
  ]);
  const reportCounts = await Report.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { targetType: 'job', targetId: { $in: jobs.map((j) => j._id) }, status: 'pending' } },
    { $group: { _id: '$targetId', count: { $sum: 1 } } },
  ]);
  const countBy = new Map(reportCounts.map((r) => [r._id.toString(), r.count]));
  return {
    jobs: jobs.map((j) => ({
      ...serializeJobCard(j, {}, { owner: true }),
      recruiterId: j.recruiter.toString(),
      viewCount: j.viewCount,
      pendingReports: countBy.get(j._id.toString()) ?? 0,
      moderation: j.moderation ?? null,
    })),
    meta: buildMeta(query, total),
  };
}

export async function moderateJob(actor: Actor, jobId: string, action: 'remove' | 'restore', reason?: string) {
  const job = await Job.findById(jobId);
  if (!job) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');

  if (action === 'remove') {
    if (job.status === 'removed') throw AppError.badRequest('Job is already removed', 'NO_CHANGE');
    job.status = 'removed';
    job.moderation = { removedBy: new Types.ObjectId(actor.id), removedAt: new Date(), reason };
    await job.save();
    void notify(job.recruiter, {
      type: 'system',
      title: 'Job posting removed',
      message: `"${job.title}" was removed by an administrator${reason ? `: ${reason}` : ''}.`,
      link: `/recruiter/jobs`,
      meta: { jobId: job._id },
    });
    await Report.updateMany(
      { targetType: 'job', targetId: job._id, status: 'pending' },
      { $set: { status: 'action_taken', resolvedBy: actor.id, resolvedAt: new Date(), resolutionNote: reason ?? 'Job removed' } },
    );
  } else {
    if (job.status !== 'removed') throw AppError.badRequest('Only removed jobs can be restored', 'NO_CHANGE');
    job.status = 'closed'; // recruiter decides whether to reopen
    job.moderation = undefined;
    await job.save();
  }
  void audit({ actor: actor.id, action: action === 'remove' ? 'job.remove' : 'job.restore', targetType: 'job', targetId: job._id, reason, ip: actor.ip });
  return serializeJobCard(job.toObject(), {}, { owner: true });
}

// ─── reports ───────────────────────────────────────────────────────────────

export async function listReports(query: AdminReportsQuery) {
  const filter = query.status?.length ? { status: { $in: query.status } } : {};
  const [reports, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit).lean(),
    Report.countDocuments(filter),
  ]);
  const jobIds = reports.filter((r) => r.targetType === 'job').map((r) => r.targetId);
  const [jobs, reporters] = await Promise.all([
    Job.find({ _id: { $in: jobIds } }).select('title companyName status').lean(),
    User.find({ _id: { $in: reports.map((r) => r.reporter) } }).select('email').lean(),
  ]);
  const jobBy = new Map(jobs.map((j) => [j._id.toString(), j]));
  const emailBy = new Map(reporters.map((u) => [u._id.toString(), u.email]));
  return {
    reports: reports.map((r) => {
      const job = jobBy.get(r.targetId.toString());
      return {
        id: r._id.toString(),
        targetType: r.targetType,
        targetId: r.targetId.toString(),
        target: job ? { title: job.title, companyName: job.companyName, status: job.status } : null,
        reporter: { id: r.reporter.toString(), email: emailBy.get(r.reporter.toString()) ?? null },
        reason: r.reason,
        details: r.details ?? null,
        status: r.status,
        resolutionNote: r.resolutionNote ?? null,
        resolvedAt: r.resolvedAt ?? null,
        createdAt: r.createdAt,
      };
    }),
    meta: buildMeta(query, total),
  };
}

export async function resolveReport(actor: Actor, reportId: string, status: 'reviewed' | 'action_taken' | 'dismissed', note?: string) {
  const report = await Report.findById(reportId);
  if (!report) throw AppError.notFound('Report not found', 'REPORT_NOT_FOUND');
  report.status = status;
  report.resolvedBy = new Types.ObjectId(actor.id);
  report.resolvedAt = new Date();
  report.resolutionNote = note;
  await report.save();
  void audit({ actor: actor.id, action: 'report.resolve', targetType: 'report', targetId: report._id, reason: note, metadata: { status }, ip: actor.ip });
  return { id: report._id.toString(), status: report.status, resolvedAt: report.resolvedAt };
}

// ─── audit log ─────────────────────────────────────────────────────────────

function serializeAudit(a: { _id: Types.ObjectId; actor: Types.ObjectId; action: string; targetType: string; targetId: Types.ObjectId; reason?: string | null; metadata?: unknown; ip?: string | null; createdAt?: Date }) {
  return {
    id: a._id.toString(),
    actor: a.actor.toString(),
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId.toString(),
    reason: a.reason ?? null,
    metadata: a.metadata ?? null,
    ip: a.ip ?? null,
    createdAt: a.createdAt,
  };
}

export async function listAuditLogs(query: AuditQuery) {
  const filter: Record<string, unknown> = {};
  if (query.action?.length) filter.action = { $in: query.action };
  if (query.actor) filter.actor = query.actor;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { logs: logs.map(serializeAudit), meta: buildMeta(query, total) };
}

// ─── platform stats ────────────────────────────────────────────────────────

function groupToObject(rows: Array<{ _id: string | null; count: number }>) {
  return Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.count]));
}

export async function platformStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dayFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

  const [usersByRole, usersByStatus, jobsByStatus, appsByStatus, signups, applicationsPerDay, pendingReports, verifiedRecruiters, topSkills] =
    await Promise.all([
      User.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Job.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: dayFormat, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Application.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: dayFormat, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Report.countDocuments({ status: 'pending' }),
      RecruiterProfile.countDocuments({ isVerified: true }),
      Job.aggregate<{ _id: string; count: number }>([
        { $match: { status: 'open' } },
        { $unwind: '$requiredSkills' },
        { $group: { _id: '$requiredSkills', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

  return {
    users: { byRole: groupToObject(usersByRole), byStatus: groupToObject(usersByStatus), total: usersByRole.reduce((s, r) => s + r.count, 0) },
    jobs: { byStatus: groupToObject(jobsByStatus), total: jobsByStatus.reduce((s, r) => s + r.count, 0) },
    applications: { byStatus: groupToObject(appsByStatus), total: appsByStatus.reduce((s, r) => s + r.count, 0) },
    recruiters: { verified: verifiedRecruiters },
    reports: { pending: pendingReports },
    timeseries: {
      signups: signups.map((r) => ({ date: r._id, count: r.count })),
      applications: applicationsPerDay.map((r) => ({ date: r._id, count: r.count })),
    },
    topSkills: topSkills.map((r) => ({ skill: r._id, count: r.count })),
  };
}
