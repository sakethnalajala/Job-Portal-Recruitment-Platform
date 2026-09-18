import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Role } from '@/types/api';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const dashboardPathFor = (role: Role) =>
  role === 'admin' ? '/admin' : role === 'recruiter' ? '/recruiter' : '/candidate';

export function initials(name: string | undefined | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 1800000 → "₹18 LPA" · 40000 (month) → "₹40,000/mo" */
export function formatSalary(salary: { min?: number; max?: number; currency?: string; period?: string; isVisible?: boolean } | undefined) {
  if (!salary || salary.isVisible === false) return 'Not disclosed';
  const { min, max, period = 'year', currency = 'INR' } = salary;
  if (min === undefined && max === undefined) return 'Not disclosed';
  const sym = currency === 'INR' ? '₹' : `${currency} `;
  const fmt = (n: number) => {
    if (period === 'year' && currency === 'INR' && n >= 100000) return `${sym}${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)} LPA`;
    return `${sym}${inr.format(n)}${period === 'month' ? '/mo' : ''}`;
  };
  if (min !== undefined && max !== undefined) {
    if (period === 'year' && currency === 'INR' && min >= 100000) {
      const a = (min / 100000).toFixed(min % 100000 === 0 ? 0 : 1);
      const b = (max / 100000).toFixed(max % 100000 === 0 ? 0 : 1);
      return `₹${a}–${b} LPA`;
    }
    return `${fmt(min)} – ${fmt(max)}`;
  }
  return fmt((min ?? max)!);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', opts).format(new Date(iso));
}

export const LABELS = {
  workType: { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' },
  employmentType: { 'full-time': 'Full-time', 'part-time': 'Part-time', internship: 'Internship', contract: 'Contract' },
  experienceLevel: { entry: 'Entry level', junior: 'Junior', mid: 'Mid level', senior: 'Senior', lead: 'Lead / Staff' },
  applicationStatus: {
    applied: 'Applied',
    under_review: 'Under review',
    shortlisted: 'Shortlisted',
    interview: 'Interview',
    selected: 'Selected',
    rejected: 'Not selected',
    withdrawn: 'Withdrawn',
  },
  jobStatus: { draft: 'Draft', open: 'Open', paused: 'Paused', closed: 'Closed', removed: 'Removed' },
} as const;
