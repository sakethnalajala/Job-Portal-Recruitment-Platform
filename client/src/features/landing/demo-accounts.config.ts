import type { Role } from '@/types/api';

/**
 * Public DEMO accounts created by `npm run seed:demo` / `seed:demo-admin`.
 * These are sandbox identities on the @demo.jobportal.in domain — never the
 * real platform admin (ADMIN_EMAIL) or any personal account. Hide the section
 * entirely in production by setting VITE_SHOW_DEMO_ACCOUNTS=false.
 */
export interface DemoAccount {
  role: Role;
  title: string;
  description: string;
  email: string;
  password: string;
  highlights: string[];
}

const PASSWORD = 'Demo@1234';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'candidate',
    title: 'Candidate demo',
    description: 'Asha Verma — backend engineer with a complete profile, applications in several stages and saved jobs.',
    email: 'asha.verma@demo.jobportal.in',
    password: PASSWORD,
    highlights: ['Skill-matched recommendations', 'Application tracker', 'Resume manager'],
  },
  {
    role: 'recruiter',
    title: 'Recruiter demo',
    description: 'Rohan Mehta at Zyntra Labs — verified company with open roles and a live applicant pipeline.',
    email: 'hr.zyntra-labs@demo.jobportal.in',
    password: PASSWORD,
    highlights: ['Post & manage jobs', 'Applicant pipeline', 'Hiring analytics'],
  },
  {
    role: 'admin',
    title: 'Admin demo',
    description: 'Sandbox administrator for platform moderation — separate from the real platform owner account.',
    email: 'demo.admin@demo.jobportal.in',
    password: PASSWORD,
    highlights: ['User management', 'Job moderation & reports', 'Audit log'],
  },
];

export const SHOW_DEMO_ACCOUNTS = (import.meta.env.VITE_SHOW_DEMO_ACCOUNTS ?? 'true') !== 'false';
