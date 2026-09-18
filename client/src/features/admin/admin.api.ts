import { del, get, patch } from '@/lib/api';
import type { JobCard, JobStatus, Role } from '@/types/api';

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended' | 'deleted';
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  profile: { fullName?: string; photoUrl?: string | null; completion?: number; companyName?: string; isVerified?: boolean; recruiterProfileId?: string } | null;
}

export interface AdminJob extends JobCard {
  recruiterId: string;
  viewCount: number;
  pendingReports: number;
  moderation: { removedAt?: string; reason?: string } | null;
}

export interface AdminReport {
  id: string;
  targetType: 'job' | 'user';
  targetId: string;
  target: { title: string; companyName: string; status: JobStatus } | null;
  reporter: { id: string; email: string | null };
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export interface PlatformStats {
  users: { byRole: Record<string, number>; byStatus: Record<string, number>; total: number };
  jobs: { byStatus: Record<string, number>; total: number };
  applications: { byStatus: Record<string, number>; total: number };
  recruiters: { verified: number };
  reports: { pending: number };
  timeseries: { signups: { date: string; count: number }[]; applications: { date: string; count: number }[] };
  topSkills: { skill: string; count: number }[];
}

const clean = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export const adminApi = {
  stats: () => get<PlatformStats>('/admin/stats'),
  users: (params: { role?: string; status?: string; q?: string; sort?: string; page?: number; limit?: number }) => get<{ users: AdminUser[] }>('/admin/users', { params: clean(params) }),
  user: (id: string) => get<{ user: AdminUser; stats: { jobs: number; applications: number }; auditTrail: AuditEntry[] }>(`/admin/users/${id}`),
  setUserStatus: (id: string, status: 'active' | 'suspended', reason?: string) => patch<{ user: AdminUser }>(`/admin/users/${id}/status`, { status, reason }),
  deleteUser: (id: string, reason?: string) => del<null>(`/admin/users/${id}`, { data: { reason } }),
  verifyRecruiter: (profileId: string, isVerified: boolean, reason?: string) => patch<{ id: string; isVerified: boolean }>(`/admin/recruiters/${profileId}/verify`, { isVerified, reason }),
  jobs: (params: { status?: string; q?: string; reported?: boolean; page?: number; limit?: number }) => get<{ jobs: AdminJob[] }>('/admin/jobs', { params: clean(params) }),
  moderateJob: (id: string, action: 'remove' | 'restore', reason?: string) => patch<{ job: AdminJob }>(`/admin/jobs/${id}/moderate`, { action, reason }),
  reports: (params: { status?: string; page?: number; limit?: number }) => get<{ reports: AdminReport[] }>('/admin/reports', { params: clean(params) }),
  resolveReport: (id: string, status: 'reviewed' | 'action_taken' | 'dismissed', resolutionNote?: string) => patch<{ report: AdminReport }>(`/admin/reports/${id}`, { status, resolutionNote }),
  auditLogs: (params: { action?: string; actor?: string; page?: number; limit?: number }) => get<{ logs: AuditEntry[] }>('/admin/audit-logs', { params: clean(params) }),
};

// ─── platform portals ──────────────────────────────────────────────────────
export interface Breakdown { key: string; count: number }
export interface Series { date: string; count: number }
export interface Analytics {
  rangeDays: number;
  totals: { users: number; candidates: number; recruiters: number; admins: number; suspended: number; jobs: number; activeJobs: number; applications: number; verifiedRecruiters: number; pendingReports: number };
  conversion: { allTime: ConversionStats; inRange: ConversionStats };
  trends: { signups: Series[]; candidateSignups: Series[]; recruiterSignups: Series[]; applications: Series[]; jobsPosted: Series[] };
  breakdowns: { jobsByStatus: Breakdown[]; applicationsByStatus: Breakdown[]; jobsByEmploymentType: Breakdown[]; jobsByWorkType: Breakdown[]; jobsByExperienceLevel: Breakdown[]; jobsByCity: Breakdown[]; jobsByIndustry: Breakdown[]; topCompanies: Breakdown[]; topSkills: Breakdown[] };
}
export interface ConversionStats { applications: number; reachedInterview: number; selected: number; interviewRate: number; offerRate: number }

export interface PlatformSettingsView {
  platformName: string;
  supportEmail: string;
  registration: { candidate: boolean; recruiter: boolean };
  maintenance: { enabled: boolean; message: string };
  announcement: { enabled: boolean; message: string; tone: 'info' | 'success' | 'warning' };
  jobs: { requireVerifiedCompanyToPublish: boolean; defaultDeadlineDays: number };
  updatedAt: string;
  updatedBy: string | null;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded';
  timestamp: string;
  api: { version: string; environment: string; uptimeSeconds: number; node: string; platform: string; prefix: string };
  database: { status: string; host: string | null; name: string | null; pingMs: number | null; collections: { name: string; count: number }[] };
  services: { storage: string; email: string };
  process: { rssMb: number; heapUsedMb: number; heapTotalMb: number; cpuCount: number; loadAverage: number[] };
  activity: { activeSessions: number; unreadNotifications: number; auditEventsLast24h: number };
  security: { accessTokenTtlMinutes: number; refreshTokenTtlDays: number; secureCookies: boolean; corsOrigins: string[] };
}

export const adminPlatformApi = {
  analytics: (days: number) => get<Analytics>('/admin/analytics', { params: { days } }),
  settings: () => get<{ settings: PlatformSettingsView }>('/admin/settings'),
  updateSettings: (body: Partial<Omit<PlatformSettingsView, 'updatedAt' | 'updatedBy'>>) => patch<{ settings: PlatformSettingsView }>('/admin/settings', body),
  system: () => get<SystemHealth>('/admin/system'),
};
