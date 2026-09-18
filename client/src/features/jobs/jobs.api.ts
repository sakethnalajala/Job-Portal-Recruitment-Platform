import { get, post, del } from '@/lib/api';
import type { CompanyCard, JobCard, JobDetail } from '@/types/api';

export interface JobSearchParams {
  q?: string;
  location?: string;
  company?: string;
  workType?: string[];
  employmentType?: string[];
  experienceLevel?: string[];
  skills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  postedWithin?: number;
  includeExpired?: boolean;
  sort?: 'relevance' | 'newest' | 'oldest' | 'salary_desc' | 'salary_asc' | 'deadline';
  page?: number;
  limit?: number;
}

function toQuery(params: JobSearchParams) {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    q[k] = Array.isArray(v) ? v.join(',') : String(v);
  }
  return q;
}

export const jobsApi = {
  search: (params: JobSearchParams) => get<{ jobs: JobCard[] }>('/jobs', { params: toQuery(params) }),
  detail: (id: string) => get<{ job: JobDetail; company: CompanyCard | null }>(`/jobs/${id}`),
  recommended: (page = 1, limit = 6) => get<{ jobs: JobCard[]; basis: { skills: string[]; city: string | null } }>('/jobs/recommended', { params: { page, limit } }),
  saved: (page = 1, limit = 10) => get<{ jobs: JobCard[] }>('/jobs/saved', { params: { page, limit } }),
  save: (id: string) => post<{ saved: boolean }>(`/jobs/${id}/save`),
  unsave: (id: string) => del<{ saved: boolean }>(`/jobs/${id}/save`),
};

export const jobKeys = {
  all: ['jobs'] as const,
  search: (params: JobSearchParams) => ['jobs', 'search', params] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
  recommended: ['jobs', 'recommended'] as const,
  saved: ['jobs', 'saved'] as const,
};
