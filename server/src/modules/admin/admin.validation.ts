import { z } from 'zod';
import { AUDIT_ACTIONS, JOB_STATUSES, REPORT_STATUSES, ROLES, USER_STATUSES } from '../../utils/constants';
import { paginationQuerySchema } from '../../utils/pagination';
import { csvEnum, objectIdSchema, optionalTrimmed } from '../../utils/validation';

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  role: csvEnum(ROLES).optional(),
  status: csvEnum(USER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'lastLogin']).default('newest'),
});

export const userStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: optionalTrimmed(500),
});

export const deleteUserSchema = z.object({ reason: optionalTrimmed(500) });

export const verifyRecruiterSchema = z.object({
  isVerified: z.boolean(),
  reason: optionalTrimmed(500),
});

export const adminJobsQuerySchema = paginationQuerySchema.extend({
  status: csvEnum(JOB_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  recruiter: objectIdSchema.optional(),
  reported: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const moderateJobSchema = z.object({
  action: z.enum(['remove', 'restore']),
  reason: optionalTrimmed(500),
});

export const adminReportsQuerySchema = paginationQuerySchema.extend({
  status: csvEnum(REPORT_STATUSES).optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['reviewed', 'action_taken', 'dismissed']),
  resolutionNote: optionalTrimmed(1000),
});

export const auditQuerySchema = paginationQuerySchema.extend({
  action: csvEnum(AUDIT_ACTIONS).optional(),
  actor: objectIdSchema.optional(),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;
export type AdminReportsQuery = z.infer<typeof adminReportsQuerySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
