import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    API_PREFIX: z.string().default('/api/v1'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    // Public URL of the frontend: CORS allow-list + absolute links in emails.
    // Defaults to the Vite dev server locally and to the production Vercel site in
    // production, so a Render service works without a dashboard change; override
    // with CLIENT_URL when the frontend moves (custom domain, another host, ...).
    CLIENT_URL: z.string().url().optional(),
    // Comma-separated list of extra allowed origins (e.g. Vercel preview deployments)
    CORS_EXTRA_ORIGINS: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    COOKIE_SECURE: booleanFromString.default('false'),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().default('job-portal'),

    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    EMAIL_FROM: z.string().default('Job Portal <onboarding@resend.dev>'),
    RESEND_API_KEY: z.string().optional(),

    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    ADMIN_NAME: z.string().default('Platform Admin'),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.EMAIL_PROVIDER === 'resend' && !cfg.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
    if (cfg.NODE_ENV === 'production') {
      if (!cfg.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        });
      }
      const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
      for (const key of required) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production`,
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Fail fast: never boot with an invalid configuration.
  // eslint-disable-next-line no-console
  console.error(`\n[env] Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const PRODUCTION_CLIENT_URL = 'https://job-portal-recruitment-platform.vercel.app';
const DEV_CLIENT_URL = 'http://localhost:5173';

/** Browsers send `Origin` as scheme://host[:port] with no path or trailing slash; compare on that form. */
export function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}
const uniqueOrigins = (values: string[]) => [...new Set(values.map(normalizeOrigin).filter(Boolean))];

const resolvedClientUrl = (parsed.data.CLIENT_URL ?? (parsed.data.NODE_ENV === 'production' ? PRODUCTION_CLIENT_URL : DEV_CLIENT_URL)).replace(/\/+$/, '');

export const env = {
  ...parsed.data,
  CLIENT_URL: resolvedClientUrl,
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: uniqueOrigins([
    resolvedClientUrl,
    ...(parsed.data.CORS_EXTRA_ORIGINS?.split(',') ?? []),
  ]),
  cloudinaryConfigured: Boolean(
    parsed.data.CLOUDINARY_CLOUD_NAME &&
      parsed.data.CLOUDINARY_API_KEY &&
      parsed.data.CLOUDINARY_API_SECRET,
  ),
};

export type Env = typeof env;
