export type Role = 'candidate' | 'recruiter' | 'admin';

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt?: string;
  profile: {
    fullName: string;
    photoUrl?: string | null;
    completion?: number;
    companyName?: string;
    isVerified?: boolean;
  } | null;
}

export interface SessionPayload {
  user: AuthUser;
  accessToken: string;
}

export type WorkType = 'remote' | 'hybrid' | 'onsite';
export type EmploymentType = 'full-time' | 'part-time' | 'internship' | 'contract';
export type ExperienceLevel = 'entry' | 'junior' | 'mid' | 'senior' | 'lead';
export type JobStatus = 'draft' | 'open' | 'paused' | 'closed' | 'removed';
export type ApplicationStatus =
  | 'applied'
  | 'under_review'
  | 'shortlisted'
  | 'interview'
  | 'selected'
  | 'rejected'
  | 'withdrawn';

export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'year' | 'month';
  isVisible?: boolean;
}

export interface JobCard {
  id: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyVerified: boolean;
  recruiterProfileId: string;
  location: { city?: string; country?: string };
  workType: WorkType;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  experienceYears: { min?: number; max?: number };
  salary: Salary;
  requiredSkills: string[];
  status: JobStatus;
  isExpired: boolean;
  deadline: string | null;
  publishedAt: string | null;
  applicationCount: number;
  createdAt: string;
  hasApplied?: boolean;
  applicationStatus?: ApplicationStatus;
  isSaved?: boolean;
  matchedSkills?: string[];
  matchScore?: number;
}

export interface CustomQuestion {
  id: string;
  question: string;
  type: 'text' | 'textarea' | 'boolean' | 'select';
  options: string[];
  required: boolean;
}

export interface JobDetail extends JobCard {
  description: string;
  responsibilities: string[];
  preferredSkills: string[];
  educationRequirement: string | null;
  benefits: string[];
  openings: number;
  customQuestions: CustomQuestion[];
  closedAt: string | null;
  updatedAt: string;
  viewCount?: number;
}

export interface CompanyCard {
  id: string;
  companyName: string;
  companyDescription?: string;
  logoUrl: string | null;
  industry?: string;
  website?: string;
  companySize?: string;
  location: { city?: string; country?: string };
  isVerified: boolean;
  openJobs?: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
