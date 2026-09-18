import { z } from 'zod';
import { locationSchema, optionalTrimmed, optionalUrl, phoneSchema } from '../../utils/validation';

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;

export const updateRecruiterProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    companyName: z.string().trim().min(2).max(150),
    companyDescription: optionalTrimmed(3000),
    industry: optionalTrimmed(100),
    website: optionalUrl,
    companySize: z.enum(COMPANY_SIZES).optional(),
    location: locationSchema,
    phone: phoneSchema,
  })
  .partial()
  .strict();

export type UpdateRecruiterProfileInput = z.infer<typeof updateRecruiterProfileSchema>;
