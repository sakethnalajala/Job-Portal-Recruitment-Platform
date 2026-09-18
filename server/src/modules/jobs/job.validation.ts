import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  QUESTION_TYPES,
  REPORT_REASONS,
  SALARY_PERIODS,
  WORK_TYPES,
} from '../../utils/constants';
import { paginationQuerySchema } from '../../utils/pagination';
import {
  booleanQuery,
  csvEnum,
  csvStrings,
  dateInput,
  locationSchema,
  optionalTrimmed,
  skillsSchema,
} from '../../utils/validation';

export const customQuestionSchema = z
  .object({
    question: z.string().trim().min(5).max(300),
    type: z.enum(QUESTION_TYPES).default('text'),
    options: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    required: z.boolean().default(true),
  })
  .refine((q) => q.type !== 'select' || q.options.length >= 2, {
    message: 'Select questions need at least 2 options',
    path: ['options'],
  });

const salarySchema = z
  .object({
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
    currency: z.string().trim().length(3).toUpperCase().default('INR'),
    period: z.enum(SALARY_PERIODS).default('year'),
    isVisible: z.boolean().default(true),
  })
  .refine((s) => s.min === undefined || s.max === undefined || s.max >= s.min, {
    message: 'Maximum salary must be greater than or equal to minimum',
    path: ['max'],
  });

const experienceYearsSchema = z
  .object({
    min: z.number().int().min(0).max(60).optional(),
    max: z.number().int().min(0).max(60).optional(),
  })
  .refine((e) => e.min === undefined || e.max === undefined || e.max >= e.min, {
    message: 'Maximum years must be greater than or equal to minimum',
    path: ['max'],
  });

const futureDate = dateInput.refine((d) => d.getTime() > Date.now(), {
  message: 'Deadline must be in the future',
});

const jobCore = {
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(50).max(10000),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  requiredSkills: skillsSchema.pipe(z.array(z.string()).min(1, 'Add at least one required skill')),
  preferredSkills: skillsSchema.default([]),
  location: locationSchema.default({}),
  workType: z.enum(WORK_TYPES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  salary: salarySchema.default({}),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  experienceYears: experienceYearsSchema.default({}),
  educationRequirement: optionalTrimmed(300),
  benefits: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  openings: z.number().int().min(1).max(1000).default(1),
  deadline: futureDate.optional(),
  customQuestions: z.array(customQuestionSchema).max(10).default([]),
};

export const createJobSchema = z
  .object({
    ...jobCore,
    status: z.enum(['draft', 'open']).default('draft'),
  })
  .strict();

export const updateJobSchema = z
  .object({ ...jobCore, deadline: futureDate.nullable() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const jobStatusSchema = z.object({
  status: z.enum(['open', 'paused', 'closed']),
});

export const jobSearchSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  workType: csvEnum(WORK_TYPES).optional(),
  employmentType: csvEnum(EMPLOYMENT_TYPES).optional(),
  experienceLevel: csvEnum(EXPERIENCE_LEVELS).optional(),
  skills: csvStrings(10).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  salaryMax: z.coerce.number().int().min(0).optional(),
  postedWithin: z.coerce.number().int().min(1).max(365).optional(), // days
  company: z.string().trim().max(150).optional(),
  includeExpired: booleanQuery,
  sort: z.enum(['relevance', 'newest', 'oldest', 'salary_desc', 'salary_asc', 'deadline']).default('relevance'),
});

export const myJobsQuerySchema = paginationQuerySchema.extend({
  status: csvEnum(JOB_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'applicants']).default('newest'),
});

export const reportJobSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: optionalTrimmed(1000),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobSearchQuery = z.infer<typeof jobSearchSchema>;
export type MyJobsQuery = z.infer<typeof myJobsQuerySchema>;
