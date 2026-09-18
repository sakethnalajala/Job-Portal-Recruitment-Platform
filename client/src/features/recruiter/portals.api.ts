import { del, get, patch, post } from '@/lib/api';

const clean = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

// ─── Interviews ────────────────────────────────────────────────────────────
export type InterviewStatus = 'scheduled' | 'rescheduled' | 'completed' | 'cancelled' | 'no_show';
export type InterviewOutcome = 'pending' | 'advance' | 'hold' | 'reject';
export type InterviewMode = 'onsite' | 'video' | 'phone';
export interface Interview {
  id: string; applicationId: string; jobId: string; candidateId: string; round: number; title: string;
  scheduledAt: string; endsAt: string; durationMinutes: number; mode: InterviewMode;
  location: string | null; meetingLink: string | null; notes: string | null; status: InterviewStatus; outcome: InterviewOutcome;
  feedback?: string | null; reminderSentAt?: string | null; history?: { action: string; at: string; note: string | null }[];
  cancelledReason: string | null; isUpcoming: boolean; createdAt: string;
  candidate?: { fullName: string; email?: string; headline?: string | null; photoUrl: string | null } | null;
  job?: { title: string; companyName: string } | null;
}
export interface ScheduleInterviewInput { applicationId: string; title?: string; scheduledAt: string; durationMinutes?: number; mode: InterviewMode; location?: string; meetingLink?: string; notes?: string }
export type InterviewRange = 'upcoming' | 'past' | 'today' | 'week' | 'all';

export const interviewsApi = {
  list: (params: { range?: InterviewRange; status?: string; job?: string; page?: number; limit?: number }) =>
    get<{ interviews: Interview[]; summary: { upcoming: number; today: number; byStatus: Record<string, number> } }>('/interviews', { params: clean(params) }),
  forApplication: (applicationId: string) => get<{ interviews: Interview[] }>(`/interviews/application/${applicationId}`),
  schedule: (body: ScheduleInterviewInput) => post<{ interview: Interview }>('/interviews', body),
  reschedule: (id: string, body: Partial<Omit<ScheduleInterviewInput, 'applicationId'>> & { reason?: string }) => patch<{ interview: Interview }>(`/interviews/${id}`, body),
  setStatus: (id: string, body: { status: 'completed' | 'cancelled' | 'no_show'; outcome?: InterviewOutcome; feedback?: string; reason?: string }) => patch<{ interview: Interview }>(`/interviews/${id}/status`, body),
  feedback: (id: string, body: { feedback?: string; outcome?: InterviewOutcome }) => patch<{ interview: Interview }>(`/interviews/${id}/feedback`, body),
  remind: (id: string) => post<{ reminderSentAt: string }>(`/interviews/${id}/remind`),
  mine: () => get<{ interviews: Interview[] }>('/interviews/me'),
};

// ─── Talent pool ───────────────────────────────────────────────────────────
export interface TalentEntry {
  id: string; candidateId: string; category: string; tags: string[]; notes: string | null; rating: number | null; savedAt: string; updatedAt: string;
  candidate: { fullName: string; email: string | null; headline: string | null; photoUrl: string | null; skills: string[]; totalExperienceYears: number | null; location: { city?: string; country?: string }; isActive: boolean } | null;
  latestApplication: { id: string; status: string; jobTitle: string | null } | null;
}
export const talentApi = {
  list: (params: { category?: string; q?: string; tag?: string; sort?: string; page?: number; limit?: number }) =>
    get<{ candidates: TalentEntry[]; categories: { name: string; count: number }[] }>('/talent-pool', { params: clean(params) }),
  check: (candidateId: string) => get<{ saved: boolean; entry: TalentEntry | null }>(`/talent-pool/check/${candidateId}`),
  save: (body: { candidateId: string; category?: string; tags?: string[]; notes?: string; rating?: number; sourceApplication?: string }) => post<{ entry: TalentEntry }>('/talent-pool', body),
  update: (id: string, body: { category?: string; tags?: string[]; notes?: string; rating?: number | null }) => patch<{ entry: TalentEntry }>(`/talent-pool/${id}`, body),
  remove: (id: string) => del<null>(`/talent-pool/${id}`),
};

// ─── Team ──────────────────────────────────────────────────────────────────
export type TeamRole = 'admin' | 'recruiter' | 'viewer';
export interface TeamMember { id: string; email: string; name: string | null; title: string | null; role: TeamRole; status: 'invited' | 'active' | 'removed'; linked: boolean; joinedAt: string | null; invitedAt: string }
export interface TeamView {
  owner: { id: string; name: string | null; companyName: string | null; email: string | null; lastLoginAt: string | null; isYou: boolean };
  yourRole: TeamRole | 'owner';
  members: TeamMember[];
  permissions: Record<string, readonly string[]>;
  memberOf: number;
}
export interface TeamActivity { since: string; newApplications: number; events: { type: 'stage' | 'interview' | 'job'; at: string; actor: string; text: string; link: string }[] }
export const teamApi = {
  get: () => get<TeamView>('/team'),
  invite: (body: { email: string; name?: string; title?: string; role: TeamRole }) => post<{ member: TeamMember }>('/team', body),
  update: (id: string, body: { role?: TeamRole; name?: string; title?: string }) => patch<{ member: TeamMember }>(`/team/${id}`, body),
  remove: (id: string) => del<null>(`/team/${id}`),
  activity: () => get<TeamActivity>('/team/activity'),
};

// ─── Analytics ─────────────────────────────────────────────────────────────
export interface Funnel { applications: number; shortlisted: number; interview: number; selected: number; rejected: number; withdrawn: number; shortlistRate: number; interviewRate: number; offerRate: number }
export interface RecruiterAnalytics {
  rangeDays: number;
  totals: { jobs: number; openJobs: number; applications: number; applicationsInRange: number; views: number; viewToApplyRate: number; upcomingInterviews: number; interviewsHeld: number };
  funnel: { allTime: Funnel; inRange: Funnel };
  trends: { applications: { date: string; count: number }[]; jobsPosted: { date: string; count: number }[] };
  breakdowns: { jobsByStatus: Record<string, number>; applicationsByStatus: Record<string, number>; interviewsByStatus: Record<string, number>; openJobsByWorkType: Record<string, number>; openJobsByLevel: Record<string, number> };
  jobs: { id: string; title: string; status: string; views: number; applications: number; shortlisted: number; interview: number; selected: number; rejected: number; conversion: number; publishedAt: string | null }[];
}
export const recruiterAnalyticsApi = { get: (days: number) => get<RecruiterAnalytics>('/stats/recruiter/analytics', { params: { days } }) };

// ─── Profile photo & notification preferences ──────────────────────────────
export const recruiterProfileApi = {
  uploadPhoto: (file: File) => { const fd = new FormData(); fd.append('photo', file); return post<{ photoUrl: string }>('/recruiters/me/photo', fd); },
  deletePhoto: () => del<null>('/recruiters/me/photo'),
};
export interface NotificationPreferences {
  email: { applicationUpdates: boolean; newApplicants: boolean; interviews: boolean; jobUpdates: boolean; marketing: boolean };
  inApp: { applicationUpdates: boolean; newApplicants: boolean; interviews: boolean; jobUpdates: boolean };
}
export const notificationPrefsApi = {
  get: () => get<{ preferences: NotificationPreferences }>('/notifications/preferences'),
  update: (body: { email?: Partial<NotificationPreferences['email']>; inApp?: Partial<NotificationPreferences['inApp']> }) => patch<{ preferences: NotificationPreferences }>('/notifications/preferences', body),
  markUnread: (id: string) => patch<{ id: string; isRead: boolean }>(`/notifications/${id}/unread`),
};
