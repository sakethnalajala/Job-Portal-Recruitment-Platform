import { del, get, patch, post } from '@/lib/api';
import type { ApplicationStatus, JobCard, WorkType } from '@/types/api';

export interface Education { _id?: string; institution: string; degree: string; field?: string; startDate: string; endDate?: string; current?: boolean; grade?: string }
export interface Experience { _id?: string; company: string; title: string; startDate: string; endDate?: string; current?: boolean; description?: string }
export interface Certification { _id?: string; name: string; issuer?: string; issueDate?: string; credentialUrl?: string }

export interface ResumeItem { id: string; originalName: string; size: number; mimeType: string; uploadedAt: string; isActive?: boolean; downloadUrl?: string | null }

export interface CandidateProfile {
  id: string;
  user: string;
  email?: string;
  isEmailVerified?: boolean;
  fullName: string;
  phone?: string;
  headline?: string;
  bio?: string;
  location: { city?: string; country?: string };
  photoUrl: string | null;
  skills: string[];
  education: Education[];
  experience: Experience[];
  certifications: Certification[];
  totalExperienceYears?: number;
  preferredWorkTypes: WorkType[];
  portfolioUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  activeResume: ResumeItem | null;
  completion: number;
}

export interface ApplicationItem {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  statusLabel: string;
  coverLetter: string | null;
  answers: { questionId: string; question: string; answer: string }[];
  statusHistory: { status: ApplicationStatus; changedAt: string; note: string | null }[];
  interview: { scheduledAt?: string; mode?: string; location?: string; meetingLink?: string; notes?: string; durationMinutes?: number } | null;
  withdrawnAt: string | null;
  appliedAt: string;
  job: JobCard | null;
  resume: ResumeItem | null;
  canWithdraw: boolean;
}

export const candidateApi = {
  me: () => get<{ profile: CandidateProfile }>('/candidates/me'),
  update: (body: Record<string, unknown>) => patch<{ profile: CandidateProfile }>('/candidates/me', body),
  uploadPhoto: (file: File) => { const fd = new FormData(); fd.append('photo', file); return post<{ photoUrl: string; completion: number }>('/candidates/me/photo', fd); },
  deletePhoto: () => del<null>('/candidates/me/photo'),
  resumes: () => get<{ resumes: ResumeItem[] }>('/candidates/me/resumes'),
  uploadResume: (file: File, setActive = true) => { const fd = new FormData(); fd.append('resume', file); fd.append('setActive', String(setActive)); return post<{ resume: ResumeItem }>('/candidates/me/resumes', fd); },
  activateResume: (id: string) => patch<{ resumes: ResumeItem[] }>(`/candidates/me/resumes/${id}/activate`),
  deleteResume: (id: string) => del<null>(`/candidates/me/resumes/${id}`),
  resumeDownload: (id: string) => get<{ resume: ResumeItem }>(`/candidates/me/resumes/${id}/download`),
  applications: (params: { status?: string; page?: number; limit?: number }) => get<{ applications: ApplicationItem[] }>('/applications/me', { params }),
  application: (id: string) => get<{ application: ApplicationItem }>(`/applications/${id}`),
  withdraw: (id: string) => patch<{ application: ApplicationItem }>(`/applications/${id}/withdraw`),
  apply: (jobId: string, fd: FormData) => post<{ application: ApplicationItem }>(`/jobs/${jobId}/applications`, fd),
};
