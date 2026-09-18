import { del, get, patch, post } from '@/lib/api';
import type { ApplicationStatus, CompanyCard, JobCard, JobDetail, JobStatus } from '@/types/api';

export interface RecruiterProfile extends CompanyCard {
  user: string;
  fullName: string;
  phone?: string;
  email?: string;
  photoUrl?: string | null;
  isEmailVerified?: boolean;
  verifiedAt?: string;
  createdAt?: string;
}

export interface ApplicantRow {
  id: string;
  jobId: string;
  candidateId: string;
  status: ApplicationStatus;
  statusLabel: string;
  appliedAt: string;
  rating: number | null;
  hasNotes: boolean;
  interview: { scheduledAt?: string; mode?: string } | null;
  job?: { id: string; title: string; status: JobStatus } | null;
  candidate: { id: string; fullName: string; email?: string; headline: string | null; photoUrl: string | null; skills: string[]; totalExperienceYears: number | null; location: { city?: string; country?: string } } | null;
}

export interface RecruiterApplication {
  id: string;
  jobId: string;
  candidateId: string;
  status: ApplicationStatus;
  statusLabel: string;
  coverLetter: string | null;
  answers: { questionId: string; question: string; answer: string }[];
  statusHistory: { status: ApplicationStatus; changedAt: string; note: string | null }[];
  interview: { scheduledAt?: string; mode?: string; location?: string; meetingLink?: string; notes?: string; durationMinutes?: number } | null;
  appliedAt: string;
  job: JobCard | null;
  candidate: { id: string; fullName: string; email?: string; headline: string | null; phone: string | null; location: { city?: string; country?: string }; skills: string[]; totalExperienceYears: number | null; photoUrl: string | null; linkedinUrl: string | null; githubUrl: string | null; portfolioUrl: string | null } | null;
  resume: { id: string; originalName: string; size: number; downloadUrl?: string | null } | null;
  recruiterNotes: string | null;
  rating: number | null;
  allowedTransitions: ApplicationStatus[];
}

export interface InterviewInput { scheduledAt: string; mode: 'onsite' | 'video' | 'phone'; location?: string; meetingLink?: string; notes?: string; durationMinutes?: number }

const clean = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export const recruiterApi = {
  profile: () => get<{ profile: RecruiterProfile }>('/recruiters/me'),
  updateProfile: (body: Record<string, unknown>) => patch<{ profile: RecruiterProfile }>('/recruiters/me', body),
  uploadLogo: (file: File) => { const fd = new FormData(); fd.append('logo', file); return post<{ logoUrl: string }>('/recruiters/me/logo', fd); },
  deleteLogo: () => del<null>('/recruiters/me/logo'),

  myJobs: (params: { status?: string; q?: string; sort?: string; page?: number; limit?: number }) => get<{ jobs: (JobCard & { viewCount: number })[] }>('/jobs/mine', { params: clean(params) }),
  job: (id: string) => get<{ job: JobDetail; company: CompanyCard | null }>(`/jobs/${id}`),
  createJob: (body: Record<string, unknown>) => post<{ job: JobDetail }>('/jobs', body),
  updateJob: (id: string, body: Record<string, unknown>) => patch<{ job: JobDetail }>(`/jobs/${id}`, body),
  setJobStatus: (id: string, status: 'open' | 'paused' | 'closed') => patch<{ job: JobDetail }>(`/jobs/${id}/status`, { status }),
  deleteJob: (id: string) => del<null>(`/jobs/${id}`),

  applicants: (params: { job?: string; status?: string; q?: string; sort?: string; page?: number; limit?: number }) => get<{ applicants: ApplicantRow[]; statusCounts: Record<string, number> }>('/applications/recruiter', { params: clean(params) }),
  application: (id: string) => get<{ application: RecruiterApplication }>(`/applications/${id}`),
  updateStatus: (id: string, body: { status: ApplicationStatus; note?: string; interview?: InterviewInput }) => patch<{ application: RecruiterApplication }>(`/applications/${id}/status`, body),
  updateNotes: (id: string, body: { recruiterNotes?: string; rating?: number | null }) => patch<{ application: RecruiterApplication }>(`/applications/${id}/notes`, body),
};
