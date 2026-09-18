import { z } from 'zod';
import { WORK_TYPES } from '../../utils/constants';
import {
  dateInput,
  locationSchema,
  optionalTrimmed,
  optionalUrl,
  phoneSchema,
  skillsSchema,
} from '../../utils/validation';

const dateRange = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .refine(
      (v) => {
        const s = v as { startDate?: Date; endDate?: Date; current?: boolean };
        if (s.current) return true;
        if (s.startDate && s.endDate) return s.endDate >= s.startDate;
        return true;
      },
      { message: 'End date must be after start date', path: ['endDate'] },
    );

export const educationSchema = dateRange({
  institution: z.string().trim().min(2).max(200),
  degree: z.string().trim().min(1).max(120),
  field: optionalTrimmed(120),
  startDate: dateInput,
  endDate: dateInput.optional(),
  current: z.boolean().default(false),
  grade: optionalTrimmed(50),
});

export const experienceSchema = dateRange({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(120),
  startDate: dateInput,
  endDate: dateInput.optional(),
  current: z.boolean().default(false),
  description: optionalTrimmed(2000),
});

export const certificationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: optionalTrimmed(200),
  issueDate: dateInput.optional(),
  credentialUrl: optionalUrl,
});

export const updateCandidateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    headline: optionalTrimmed(150),
    bio: optionalTrimmed(2000),
    location: locationSchema,
    skills: skillsSchema,
    education: z.array(educationSchema).max(20),
    experience: z.array(experienceSchema).max(20),
    certifications: z.array(certificationSchema).max(20),
    totalExperienceYears: z.number().min(0).max(60),
    preferredWorkTypes: z.array(z.enum(WORK_TYPES)).max(3),
    portfolioUrl: optionalUrl,
    linkedinUrl: optionalUrl,
    githubUrl: optionalUrl,
  })
  .partial()
  .strict();

export type UpdateCandidateProfileInput = z.infer<typeof updateCandidateProfileSchema>;

export const uploadResumeBodySchema = z.object({
  setActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(true),
});
