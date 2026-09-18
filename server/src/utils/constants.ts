export const ROLES = ['candidate', 'recruiter', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = ['draft', 'open', 'paused', 'closed', 'removed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORK_TYPES = ['remote', 'hybrid', 'onsite'] as const;
export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'internship', 'contract'] as const;
export const EXPERIENCE_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead'] as const;
export const SALARY_PERIODS = ['year', 'month'] as const;
export const QUESTION_TYPES = ['text', 'textarea', 'boolean', 'select'] as const;

export const APPLICATION_STATUSES = [
  'applied',
  'under_review',
  'shortlisted',
  'interview',
  'selected',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Recruiter-driven transitions. Candidate withdrawal is handled separately. */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  applied: ['under_review', 'shortlisted', 'rejected'],
  under_review: ['shortlisted', 'rejected'],
  shortlisted: ['interview', 'rejected'],
  interview: ['selected', 'rejected'],
  selected: [],
  rejected: [],
  withdrawn: [],
};

export const WITHDRAWABLE_STATUSES: readonly ApplicationStatus[] = [
  'applied',
  'under_review',
  'shortlisted',
  'interview',
];

export const INTERVIEW_MODES = ['onsite', 'video', 'phone'] as const;

export const NOTIFICATION_TYPES = [
  'application_submitted',
  'application_status',
  'new_applicant',
  'application_withdrawn',
  'interview_scheduled',
  'job_closed',
  'recruiter_verified',
  'account',
  'system',
] as const;

export const REPORT_REASONS = ['spam', 'scam', 'misleading', 'discriminatory', 'other'] as const;
export const REPORT_STATUSES = ['pending', 'reviewed', 'action_taken', 'dismissed'] as const;

export const AUDIT_ACTIONS = [
  'user.suspend',
  'user.activate',
  'user.delete',
  'recruiter.verify',
  'recruiter.unverify',
  'job.remove',
  'job.restore',
  'report.resolve',
  'settings.update',
] as const;

export const PAGINATION = { DEFAULT_LIMIT: 10, MAX_LIMIT: 50 } as const;

export const FILE_LIMITS = {
  RESUME_MAX_BYTES: 5 * 1024 * 1024,
  IMAGE_MAX_BYTES: 2 * 1024 * 1024,
} as const;

export const TOKEN_TTL = {
  EMAIL_VERIFICATION_HOURS: 24,
  PASSWORD_RESET_MINUTES: 30,
} as const;
