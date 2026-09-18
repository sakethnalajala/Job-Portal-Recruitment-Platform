import os from 'node:os';
import mongoose, { Types, type Model } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { Application } from '../../models/Application';
import { AuditLog } from '../../models/AuditLog';
import { Job } from '../../models/Job';
import { Notification } from '../../models/Notification';
import { PlatformSettings, getPlatformSettings } from '../../models/PlatformSettings';
import { RecruiterProfile } from '../../models/RecruiterProfile';
import { RefreshToken } from '../../models/RefreshToken';
import { Report } from '../../models/Report';
import { User } from '../../models/User';
import { audit } from '../../services/audit.service';

// ─── analytics ─────────────────────────────────────────────────────────────

export const analyticsQuerySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });

const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;
const group = (m: AnyModel, field: string, match: Record<string, unknown> = {}, limit = 10) =>
  m.aggregate<{ _id: string | null; count: number }>([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: limit }]);
const rows = (r: { _id: string | null; count: number }[]) => r.map((x) => ({ key: x._id ?? 'unknown', count: x.count }));
const series = (r: { _id: string; count: number }[]) => r.map((x) => ({ date: x._id, count: x.count }));

export async function analytics(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const perDay = (m: AnyModel, extra: Record<string, unknown> = {}) =>
    m.aggregate<{ _id: string; count: number }>([{ $match: { createdAt: { $gte: since }, ...extra } }, { $group: { _id: day, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);

  const [
    usersByRole, usersByStatus, jobsByStatus, appsByStatus, verifiedRecruiters, pendingReports,
    signups, candidateSignups, recruiterSignups, applicationsPerDay, jobsPerDay,
    jobsByEmployment, jobsByWorkType, jobsByLevel, jobsByCity, jobsByIndustryRaw, topCompanies, topSkills,
    appsInRange, selectedInRange, interviewInRange,
  ] = await Promise.all([
    group(User, 'role'), group(User, 'status'), group(Job, 'status'), group(Application, 'status'),
    RecruiterProfile.countDocuments({ isVerified: true }), Report.countDocuments({ status: 'pending' }),
    perDay(User), perDay(User, { role: 'candidate' }), perDay(User, { role: 'recruiter' }), perDay(Application), perDay(Job),
    group(Job, 'employmentType', { status: 'open' }), group(Job, 'workType', { status: 'open' }), group(Job, 'experienceLevel', { status: 'open' }),
    group(Job, 'location.city', { status: 'open' }, 8),
    Job.aggregate<{ _id: string | null; count: number }>([
      { $match: { status: 'open' } },
      { $lookup: { from: 'recruiterprofiles', localField: 'recruiterProfile', foreignField: '_id', as: 'rp' } },
      { $unwind: { path: '$rp', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$rp.industry', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    group(Job, 'companyName', { status: { $ne: 'removed' } }, 8),
    Job.aggregate<{ _id: string; count: number }>([{ $match: { status: 'open' } }, { $unwind: '$requiredSkills' }, { $group: { _id: '$requiredSkills', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    Application.countDocuments({ createdAt: { $gte: since } }),
    Application.countDocuments({ createdAt: { $gte: since }, status: 'selected' }),
    Application.countDocuments({ createdAt: { $gte: since }, status: { $in: ['interview', 'selected'] } }),
  ]);

  const totalApps = rows(appsByStatus).reduce((s, r) => s + r.count, 0);
  const selected = rows(appsByStatus).find((r) => r.key === 'selected')?.count ?? 0;
  const reachedInterview = rows(appsByStatus).filter((r) => r.key === 'interview' || r.key === 'selected').reduce((s, r) => s + r.count, 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  return {
    rangeDays: days,
    totals: {
      users: rows(usersByRole).reduce((s, r) => s + r.count, 0),
      candidates: rows(usersByRole).find((r) => r.key === 'candidate')?.count ?? 0,
      recruiters: rows(usersByRole).find((r) => r.key === 'recruiter')?.count ?? 0,
      admins: rows(usersByRole).find((r) => r.key === 'admin')?.count ?? 0,
      suspended: rows(usersByStatus).find((r) => r.key === 'suspended')?.count ?? 0,
      jobs: rows(jobsByStatus).reduce((s, r) => s + r.count, 0),
      activeJobs: rows(jobsByStatus).find((r) => r.key === 'open')?.count ?? 0,
      applications: totalApps,
      verifiedRecruiters,
      pendingReports,
    },
    conversion: {
      allTime: { applications: totalApps, reachedInterview, selected, interviewRate: pct(reachedInterview, totalApps), offerRate: pct(selected, totalApps) },
      inRange: { applications: appsInRange, reachedInterview: interviewInRange, selected: selectedInRange, interviewRate: pct(interviewInRange, appsInRange), offerRate: pct(selectedInRange, appsInRange) },
    },
    trends: { signups: series(signups), candidateSignups: series(candidateSignups), recruiterSignups: series(recruiterSignups), applications: series(applicationsPerDay), jobsPosted: series(jobsPerDay) },
    breakdowns: {
      jobsByStatus: rows(jobsByStatus),
      applicationsByStatus: rows(appsByStatus),
      jobsByEmploymentType: rows(jobsByEmployment),
      jobsByWorkType: rows(jobsByWorkType),
      jobsByExperienceLevel: rows(jobsByLevel),
      jobsByCity: rows(jobsByCity),
      jobsByIndustry: rows(jobsByIndustryRaw),
      topCompanies: rows(topCompanies),
      topSkills: rows(topSkills),
    },
  };
}

// ─── settings ──────────────────────────────────────────────────────────────

export const settingsUpdateSchema = z
  .object({
    platformName: z.string().trim().min(2).max(60),
    supportEmail: z.string().trim().email().max(254).or(z.literal('')),
    registration: z.object({ candidate: z.boolean(), recruiter: z.boolean() }).partial(),
    maintenance: z.object({ enabled: z.boolean(), message: z.string().trim().min(5).max(300) }).partial(),
    announcement: z.object({ enabled: z.boolean(), message: z.string().trim().max(300), tone: z.enum(['info', 'success', 'warning']) }).partial(),
    jobs: z.object({ requireVerifiedCompanyToPublish: z.boolean(), defaultDeadlineDays: z.number().int().min(1).max(365) }).partial(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

function serializeSettings(s: Awaited<ReturnType<typeof getPlatformSettings>>) {
  return {
    platformName: s.platformName,
    supportEmail: s.supportEmail ?? '',
    registration: { candidate: s.registration?.candidate ?? true, recruiter: s.registration?.recruiter ?? true },
    maintenance: { enabled: s.maintenance?.enabled ?? false, message: s.maintenance?.message ?? '' },
    announcement: { enabled: s.announcement?.enabled ?? false, message: s.announcement?.message ?? '', tone: s.announcement?.tone ?? 'info' },
    jobs: { requireVerifiedCompanyToPublish: s.jobs?.requireVerifiedCompanyToPublish ?? false, defaultDeadlineDays: s.jobs?.defaultDeadlineDays ?? 30 },
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy?.toString() ?? null,
  };
}

export async function getSettings() {
  return serializeSettings(await getPlatformSettings());
}

/** Only the switches the public UI needs (banner, registration, maintenance). Never auth-gated. */
export async function getPublicSettings() {
  const s = await getPlatformSettings();
  return {
    platformName: s.platformName,
    supportEmail: s.supportEmail ?? null,
    registration: { candidate: s.registration?.candidate ?? true, recruiter: s.registration?.recruiter ?? true },
    maintenance: { enabled: s.maintenance?.enabled ?? false, message: s.maintenance?.enabled ? s.maintenance.message : null },
    announcement: s.announcement?.enabled && s.announcement.message ? { message: s.announcement.message, tone: s.announcement.tone ?? 'info' } : null,
  };
}

export async function updateSettings(actor: { id: string; ip?: string | undefined }, input: SettingsUpdate) {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) flat[`${k}.${k2}`] = v2;
    else flat[k] = v;
  }
  flat.updatedBy = new Types.ObjectId(actor.id);
  const doc = await PlatformSettings.findOneAndUpdate({ key: 'default' }, { $set: flat }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).lean();
  void audit({ actor: actor.id, action: 'settings.update', targetType: 'settings', targetId: doc!._id, metadata: input, ip: actor.ip });
  return serializeSettings(doc!);
}

// ─── system health ─────────────────────────────────────────────────────────

export async function systemHealth() {
  const conn = mongoose.connection;
  const dbUp = conn.readyState === 1;
  let pingMs: number | null = null;
  let collections: { name: string; count: number }[] = [];
  if (dbUp && conn.db) {
    const t0 = Date.now();
    try {
      await conn.db.admin().ping();
      pingMs = Date.now() - t0;
      const names = ['users', 'jobs', 'applications', 'candidateprofiles', 'recruiterprofiles', 'resumes', 'notifications', 'savedjobs', 'reports', 'auditlogs', 'refreshtokens'];
      collections = await Promise.all(names.map(async (name) => ({ name, count: await conn.db!.collection(name).estimatedDocumentCount() })));
    } catch {
      pingMs = null;
    }
  }
  const mem = process.memoryUsage();
  const [activeSessions, unreadNotifications, last24hAudit] = await Promise.all([
    RefreshToken.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }),
    Notification.countDocuments({ isRead: false }),
    AuditLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86_400_000) } }),
  ]);
  return {
    status: dbUp ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    api: { version: '1.0.0', environment: env.NODE_ENV, uptimeSeconds: Math.round(process.uptime()), node: process.version, platform: `${os.type()} ${os.arch()}`, prefix: env.API_PREFIX },
    database: {
      status: dbUp ? 'connected' : 'disconnected',
      // Host only — never the connection string or credentials.
      host: conn.host ?? null,
      name: conn.name ?? null,
      pingMs,
      collections,
    },
    services: { storage: env.cloudinaryConfigured ? 'configured' : 'not_configured', email: env.EMAIL_PROVIDER },
    process: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576), cpuCount: os.cpus().length, loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100) },
    activity: { activeSessions, unreadNotifications, auditEventsLast24h: last24hAudit },
    security: { accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES, refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS, secureCookies: env.COOKIE_SECURE, corsOrigins: env.corsOrigins },
  };
}
