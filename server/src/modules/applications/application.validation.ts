import { z } from 'zod';
import { APPLICATION_STATUSES, INTERVIEW_MODES } from '../../utils/constants';
import { paginationQuerySchema } from '../../utils/pagination';
import { csvEnum, objectIdSchema, optionalTrimmed } from '../../utils/validation';

const answerSchema = z.object({
  questionId: objectIdSchema,
  answer: z.union([z.string().trim().max(2000), z.boolean()]).transform((v) => (typeof v === 'boolean' ? String(v) : v)),
});

/**
 * The apply endpoint is multipart (optional resume file), so nested values
 * arrive as strings. `answers` may be a JSON string or a parsed array.
 */
export const applySchema = z.object({
  resumeId: objectIdSchema.optional(),
  coverLetter: optionalTrimmed(5000),
  answers: z
    .union([z.string(), z.array(answerSchema)])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return [] as z.infer<typeof answerSchema>[];
      if (Array.isArray(v)) return v;
      try {
        const parsed = z.array(answerSchema).safeParse(JSON.parse(v));
        if (parsed.success) return parsed.data;
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answers has an invalid shape' });
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answers must be valid JSON' });
      }
      return z.NEVER;
    }),
});

export const interviewSchema = z.object({
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), 'Interview must be in the future'),
  mode: z.enum(INTERVIEW_MODES),
  location: optionalTrimmed(300),
  meetingLink: z.string().trim().url().max(500).or(z.literal('')).optional().transform((v) => (v === '' ? undefined : v)),
  notes: optionalTrimmed(2000),
  durationMinutes: z.number().int().min(5).max(480).optional(),
});

export const updateStatusSchema = z
  .object({
    status: z.enum(['under_review', 'shortlisted', 'interview', 'selected', 'rejected']),
    note: optionalTrimmed(1000),
    interview: interviewSchema.optional(),
  })
  .refine((v) => v.status !== 'interview' || v.interview !== undefined, {
    message: 'Interview details are required when moving to the interview stage',
    path: ['interview'],
  });

export const recruiterNotesSchema = z
  .object({
    recruiterNotes: optionalTrimmed(3000),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const myApplicationsQuerySchema = paginationQuerySchema.extend({
  status: csvEnum(APPLICATION_STATUSES).optional(),
});

export const applicantsQuerySchema = paginationQuerySchema.extend({
  status: csvEnum(APPLICATION_STATUSES).optional(),
  sort: z.enum(['newest', 'oldest', 'rating']).default('newest'),
});

export const recruiterApplicationsQuerySchema = applicantsQuerySchema.extend({
  job: objectIdSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export type ApplyInput = z.infer<typeof applySchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type RecruiterNotesInput = z.infer<typeof recruiterNotesSchema>;
export type MyApplicationsQuery = z.infer<typeof myApplicationsQuerySchema>;
export type ApplicantsQuery = z.infer<typeof applicantsQuerySchema>;
export type RecruiterApplicationsQuery = z.infer<typeof recruiterApplicationsQuerySchema>;
