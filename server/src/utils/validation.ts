import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

export const idParamSchema = z.object({ id: objectIdSchema });

/** Accepts "a,b,c" or ["a","b"] and yields a trimmed, de-duplicated, lower-cased array. */
export function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .transform((arr) => [...new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.enum(values)).max(values.length));
}

export const csvStrings = (max = 20, itemMax = 50) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .transform((arr) => [...new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.string().max(itemMax)).max(max));

export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter a valid URL')
  .or(z.literal(''))
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s\-()]{6,19}$/, 'Enter a valid phone number')
  .or(z.literal(''))
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const dateInput = z.coerce.date();

export const skillsSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(50)
  .transform((arr) => [...new Set(arr.map((s) => s.toLowerCase()))]);

export const locationSchema = z.object({
  city: optionalTrimmed(100),
  country: optionalTrimmed(100),
});

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
