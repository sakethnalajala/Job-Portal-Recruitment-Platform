import { Types, type FilterQuery } from 'mongoose';
import { Application } from '../../models/Application';
import { CandidateProfile } from '../../models/CandidateProfile';
import { Job, type JobAttrs } from '../../models/Job';
import { RecruiterProfile } from '../../models/RecruiterProfile';
import { Report } from '../../models/Report';
import { SavedJob } from '../../models/SavedJob';
import { notifyMany } from '../../services/notification.service';
import { getPlatformSettings } from '../../models/PlatformSettings';
import { assertScope, getRecruiterScope, type Capability } from '../../services/team.service';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import { WITHDRAWABLE_STATUSES, type JobStatus } from '../../utils/constants';
import { buildMeta, toSkip, type PaginationQuery } from '../../utils/pagination';
import { escapeRegex } from '../../utils/validation';
import { serializeCompanyCard } from '../recruiters/recruiter.service';
import type { CreateJobInput, JobSearchQuery, MyJobsQuery, UpdateJobInput } from './job.validation';

export type JobLean = JobAttrs & { _id: Types.ObjectId; score?: number };

// ─── serializers ───────────────────────────────────────────────────────────

export function isExpired(job: Pick<JobAttrs, 'deadline'>): boolean {
  return Boolean(job.deadline && job.deadline.getTime() < Date.now());
}

export function acceptsApplications(job: Pick<JobAttrs, 'status' | 'deadline'>): boolean {
  return job.status === 'open' && !isExpired(job);
}

interface ViewerFlags {
  hasApplied?: boolean;
  applicationStatus?: string;
  isSaved?: boolean;
  matchedSkills?: string[];
  matchScore?: number;
}

function salaryView(job: JobLean, { owner }: { owner: boolean }) {
  const s: Partial<NonNullable<JobAttrs['salary']>> = job.salary ?? {};
  if (!owner && s.isVisible === false) return { isVisible: false, currency: s.currency, period: s.period };
  return { min: s.min, max: s.max, currency: s.currency, period: s.period, isVisible: s.isVisible };
}

export function serializeJobCard(job: JobLean, flags: ViewerFlags = {}, opts: { owner?: boolean } = {}) {
  return {
    id: job._id.toString(),
    title: job.title,
    companyName: job.companyName,
    companyLogoUrl: storageService.getImageUrl(job.companyLogoPublicId),
    companyVerified: job.companyVerified,
    recruiterProfileId: job.recruiterProfile.toString(),
    location: job.location ?? {},
    workType: job.workType,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    experienceYears: job.experienceYears ?? {},
    salary: salaryView(job, { owner: opts.owner ?? false }),
    requiredSkills: job.requiredSkills,
    status: job.status,
    isExpired: isExpired(job),
    deadline: job.deadline ?? null,
    publishedAt: job.publishedAt ?? null,
    applicationCount: job.applicationCount,
    createdAt: job.createdAt,
    ...flags,
  };
}

export function serializeJobDetail(job: JobLean, flags: ViewerFlags = {}, opts: { owner?: boolean } = {}) {
  return {
    ...serializeJobCard(job, flags, opts),
    description: job.description,
    responsibilities: job.responsibilities,
    preferredSkills: job.preferredSkills,
    educationRequirement: job.educationRequirement ?? null,
    benefits: job.benefits,
    openings: job.openings,
    customQuestions: job.customQuestions.map((q) => ({
      id: q._id.toString(),
      question: q.question,
      type: q.type,
      options: q.options,
      required: q.required,
    })),
    closedAt: job.closedAt ?? null,
    updatedAt: job.updatedAt,
    ...(opts.owner ? { viewCount: job.viewCount, moderation: job.moderation ?? null } : {}),
  };
}

/** Adds hasApplied / isSaved for a candidate viewer in two indexed queries. */
async function candidateFlags(jobs: JobLean[], candidateId: string | undefined) {
  const map = new Map<string, ViewerFlags>();
  if (!candidateId || jobs.length === 0) return map;
  const ids = jobs.map((j) => j._id);
  const [apps, saved] = await Promise.all([
    Application.find({ candidate: candidateId, job: { $in: ids } }).select('job status').lean(),
    SavedJob.find({ candidate: candidateId, job: { $in: ids } }).select('job').lean(),
  ]);
  for (const a of apps) map.set(a.job.toString(), { hasApplied: true, applicationStatus: a.status });
  for (const s of saved) {
    const key = s.job.toString();
    map.set(key, { ...(map.get(key) ?? {}), isSaved: true });
  }
  return map;
}

// ─── ownership ─────────────────────────────────────────────────────────────

/** Owner or team member with the required capability (see team.service). */
async function loadOwnedJob(jobId: string, recruiterId: string, capability: Capability = 'manageJobs') {
  const job = await Job.findById(jobId);
  if (!job) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (!job.recruiter.equals(recruiterId)) await assertScope(recruiterId, job.recruiter, capability);
  if (job.status === 'removed') {
    throw AppError.forbidden('This job was removed by an administrator', 'JOB_REMOVED');
  }
  return job;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

/** Platform switch: admins can require a verified company before jobs go live. */
async function assertCompanyMayPublish(companyVerified: boolean): Promise<void> {
  const settings = await getPlatformSettings();
  if (settings.jobs?.requireVerifiedCompanyToPublish && !companyVerified) {
    throw AppError.forbidden('Only verified companies can publish jobs right now. Complete your company profile to get verified.', 'COMPANY_NOT_VERIFIED');
  }
}

export async function createJob(recruiter: Express.AuthUser, input: CreateJobInput) {
  const profile = await RecruiterProfile.findOne({ user: recruiter.id }).lean();
  if (!profile) throw AppError.notFound('Recruiter profile not found', 'PROFILE_NOT_FOUND');
  if (input.status === 'open' && !recruiter.isEmailVerified) {
    throw AppError.forbidden('Verify your email address before publishing a job', 'EMAIL_NOT_VERIFIED');
  }
  if (input.status === 'open') await assertCompanyMayPublish(profile.isVerified);

  const job = await Job.create({
    ...input,
    recruiter: recruiter.id,
    recruiterProfile: profile._id,
    companyName: profile.companyName,
    companyLogoPublicId: profile.logoPublicId,
    companyVerified: profile.isVerified,
    publishedAt: input.status === 'open' ? new Date() : undefined,
  });
  return serializeJobDetail(job.toObject(), {}, { owner: true });
}

export async function updateJob(jobId: string, recruiterId: string, input: UpdateJobInput) {
  const job = await loadOwnedJob(jobId, recruiterId);
  const { deadline, ...rest } = input;
  job.set(rest);
  if (deadline !== undefined) job.deadline = deadline ?? undefined;
  await job.save();
  return serializeJobDetail(job.toObject(), {}, { owner: true });
}

const STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['open'],
  open: ['paused', 'closed'],
  paused: ['open', 'closed'],
  closed: ['open'],
  removed: [],
};

export async function changeJobStatus(
  jobId: string,
  recruiter: Express.AuthUser,
  status: 'open' | 'paused' | 'closed',
) {
  const job = await loadOwnedJob(jobId, recruiter.id);
  const current = job.status as JobStatus;
  if (!STATUS_TRANSITIONS[current].includes(status)) {
    throw AppError.badRequest(`Cannot move a ${current} job to ${status}`, 'INVALID_STATUS_TRANSITION');
  }

  if (status === 'open') {
    if (!recruiter.isEmailVerified) {
      throw AppError.forbidden('Verify your email address before publishing a job', 'EMAIL_NOT_VERIFIED');
    }
    if (isExpired(job)) {
      throw AppError.badRequest('Set a future deadline before reopening this job', 'JOB_EXPIRED');
    }
    await assertCompanyMayPublish(job.companyVerified);
    if (!job.publishedAt) job.publishedAt = new Date();
    job.closedAt = undefined;
  }
  if (status === 'closed') {
    job.closedAt = new Date();
    const active = await Application.find({
      job: job._id,
      status: { $in: WITHDRAWABLE_STATUSES },
    })
      .select('candidate')
      .lean();
    void notifyMany(
      active.map((a) => a.candidate),
      {
        type: 'job_closed',
        title: 'Job closed',
        message: `${job.companyName} has closed the "${job.title}" posting.`,
        link: '/candidate/applications',
        meta: { jobId: job._id },
      },
    );
  }

  job.status = status;
  await job.save();
  return serializeJobDetail(job.toObject(), {}, { owner: true });
}

export async function deleteJob(jobId: string, recruiterId: string) {
  const job = await loadOwnedJob(jobId, recruiterId);
  const applications = await Application.countDocuments({ job: job._id });
  if (job.status !== 'draft' && applications > 0) {
    throw AppError.conflict(
      'This job has applications and cannot be deleted. Close it instead to preserve history.',
      'JOB_HAS_APPLICATIONS',
    );
  }
  await Promise.all([job.deleteOne(), SavedJob.deleteMany({ job: job._id })]);
}

// ─── reads ─────────────────────────────────────────────────────────────────

export async function getJob(jobId: string, viewer: Express.AuthUser | undefined) {
  const job = await Job.findById(jobId).lean();
  if (!job) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');

  const isOwner = viewer?.role === 'recruiter' && (job.recruiter.toString() === viewer.id || (await getRecruiterScope(viewer.id)).roles.has(job.recruiter.toString()));
  const isAdmin = viewer?.role === 'admin';
  const publiclyVisible = job.status === 'open' || job.status === 'closed';
  if (!publiclyVisible && !isOwner && !isAdmin) {
    throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  }

  if (!isOwner && !isAdmin) {
    void Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } }).exec();
  }

  const [flags, company] = await Promise.all([
    candidateFlags([job], viewer?.role === 'candidate' ? viewer.id : undefined),
    RecruiterProfile.findById(job.recruiterProfile).lean(),
  ]);

  return {
    job: serializeJobDetail(job, flags.get(job._id.toString()) ?? {}, { owner: isOwner || isAdmin }),
    company: company ? serializeCompanyCard(company) : null,
  };
}

export async function listMyJobs(recruiterId: string, query: MyJobsQuery) {
  const scope = await getRecruiterScope(recruiterId);
  const filter: FilterQuery<JobAttrs> = { recruiter: { $in: scope.ownerIds } };
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.q) filter.title = { $regex: escapeRegex(query.q), $options: 'i' };

  const sort: Record<string, 1 | -1> =
    query.sort === 'oldest'
      ? { createdAt: 1 }
      : query.sort === 'applicants'
        ? { applicationCount: -1, createdAt: -1 }
        : { createdAt: -1 };

  const [jobs, total] = await Promise.all([
    Job.find(filter).sort(sort).skip(toSkip(query)).limit(query.limit).lean(),
    Job.countDocuments(filter),
  ]);
  return {
    jobs: jobs.map((j) => ({ ...serializeJobCard(j, {}, { owner: true }), viewCount: j.viewCount })),
    meta: buildMeta(query, total),
  };
}

export async function searchJobs(query: JobSearchQuery, viewer: Express.AuthUser | undefined) {
  const and: FilterQuery<JobAttrs>[] = [{ status: 'open' }];

  if (!query.includeExpired) and.push({ $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] });
  if (query.q) and.push({ $text: { $search: query.q } });
  if (query.location) {
    const re = { $regex: escapeRegex(query.location), $options: 'i' };
    and.push({ $or: [{ 'location.city': re }, { 'location.country': re }] });
  }
  if (query.company) and.push({ companyName: { $regex: escapeRegex(query.company), $options: 'i' } });
  if (query.workType?.length) and.push({ workType: { $in: query.workType } });
  if (query.employmentType?.length) and.push({ employmentType: { $in: query.employmentType } });
  if (query.experienceLevel?.length) and.push({ experienceLevel: { $in: query.experienceLevel } });
  if (query.skills?.length) and.push({ requiredSkills: { $in: query.skills } });
  if (query.salaryMin !== undefined) and.push({ 'salary.max': { $gte: query.salaryMin } });
  if (query.salaryMax !== undefined) and.push({ 'salary.min': { $lte: query.salaryMax } });
  if (query.postedWithin) {
    and.push({ publishedAt: { $gte: new Date(Date.now() - query.postedWithin * 24 * 60 * 60 * 1000) } });
  }

  const filter: FilterQuery<JobAttrs> = { $and: and };
  const useTextScore = Boolean(query.q) && query.sort === 'relevance';

  const sort: Record<string, 1 | -1 | { $meta: 'textScore' }> = useTextScore
    ? { score: { $meta: 'textScore' }, publishedAt: -1 }
    : query.sort === 'oldest'
      ? { publishedAt: 1 }
      : query.sort === 'salary_desc'
        ? { 'salary.max': -1, publishedAt: -1 }
        : query.sort === 'salary_asc'
          ? { 'salary.min': 1, publishedAt: -1 }
          : query.sort === 'deadline'
            ? { deadline: 1, publishedAt: -1 }
            : { publishedAt: -1 };

  let find = Job.find(filter);
  if (useTextScore) find = find.select({ score: { $meta: 'textScore' } });

  const [jobs, total] = await Promise.all([
    find.sort(sort as Record<string, 1 | -1>).skip(toSkip(query)).limit(query.limit).lean<JobLean[]>(),
    Job.countDocuments(filter),
  ]);

  const flags = await candidateFlags(jobs, viewer?.role === 'candidate' ? viewer.id : undefined);
  return {
    jobs: jobs.map((j) => serializeJobCard(j, flags.get(j._id.toString()) ?? {})),
    meta: buildMeta(query, total),
  };
}

// ─── recommendations (rule-based) ──────────────────────────────────────────

function levelForYears(years: number | undefined) {
  if (years === undefined) return undefined;
  if (years < 1) return 'entry';
  if (years < 3) return 'junior';
  if (years < 6) return 'mid';
  if (years < 10) return 'senior';
  return 'lead';
}

export async function recommendedJobs(candidateId: string, pagination: PaginationQuery) {
  const profile = await CandidateProfile.findOne({ user: candidateId }).lean();
  if (!profile) throw AppError.notFound('Candidate profile not found', 'PROFILE_NOT_FOUND');

  const skills = profile.skills ?? [];
  const city = profile.location?.city;
  const preferredWorkTypes = profile.preferredWorkTypes ?? [];
  const level = levelForYears(profile.totalExperienceYears ?? undefined);

  const applied = await Application.find({ candidate: candidateId }).select('job').lean();
  const excluded = applied.map((a) => a.job);

  const or: FilterQuery<JobAttrs>[] = [];
  if (skills.length) or.push({ requiredSkills: { $in: skills } }, { preferredSkills: { $in: skills } });
  if (city) or.push({ 'location.city': { $regex: `^${escapeRegex(city)}$`, $options: 'i' } });

  const base: FilterQuery<JobAttrs> = {
    status: 'open',
    _id: { $nin: excluded },
    $or: [{ deadline: null }, { deadline: { $gt: new Date() } }],
  };
  const filter: FilterQuery<JobAttrs> = or.length ? { $and: [base, { $or: or }] } : base;

  // Bounded candidate set, scored in memory. Fine at portfolio scale; a
  // precomputed score field would be the next step for large catalogues.
  const candidates = await Job.find(filter).sort({ publishedAt: -1 }).limit(300).lean<JobLean[]>();

  const skillSet = new Set(skills);
  const scored = candidates
    .map((job) => {
      const matchedRequired = job.requiredSkills.filter((s) => skillSet.has(s));
      const matchedPreferred = job.preferredSkills.filter((s) => skillSet.has(s));
      let score = matchedRequired.length * 3 + matchedPreferred.length;
      if (city && job.location?.city && job.location.city.toLowerCase() === city.toLowerCase()) score += 2;
      if (job.workType === 'remote' || preferredWorkTypes.includes(job.workType)) score += 1;
      if (level && job.experienceLevel === level) score += 1;
      if (job.companyVerified) score += 0.5;
      return { job, score, matchedSkills: [...matchedRequired, ...matchedPreferred] };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.job.publishedAt?.getTime() ?? 0) - (a.job.publishedAt?.getTime() ?? 0));

  const page = scored.slice(toSkip(pagination), toSkip(pagination) + pagination.limit);
  const flags = await candidateFlags(
    page.map((r) => r.job),
    candidateId,
  );

  return {
    jobs: page.map((r) =>
      serializeJobCard(r.job, {
        ...(flags.get(r.job._id.toString()) ?? {}),
        matchedSkills: r.matchedSkills,
        matchScore: r.score,
      }),
    ),
    meta: buildMeta(pagination, scored.length),
    basis: { skills, city: city ?? null, experienceLevel: level ?? null },
  };
}

// ─── saved jobs ────────────────────────────────────────────────────────────

export async function saveJob(candidateId: string, jobId: string) {
  const job = await Job.findById(jobId).select('status').lean();
  if (!job || job.status === 'removed' || job.status === 'draft') {
    throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  }
  await SavedJob.updateOne(
    { candidate: candidateId, job: jobId },
    { $setOnInsert: { candidate: candidateId, job: jobId } },
    { upsert: true },
  );
}

export async function unsaveJob(candidateId: string, jobId: string) {
  await SavedJob.deleteOne({ candidate: candidateId, job: jobId });
}

export async function listSavedJobs(candidateId: string, pagination: PaginationQuery) {
  const filter = { candidate: candidateId };
  const [saved, total] = await Promise.all([
    SavedJob.find(filter).sort({ createdAt: -1 }).skip(toSkip(pagination)).limit(pagination.limit).lean(),
    SavedJob.countDocuments(filter),
  ]);
  const jobs = await Job.find({ _id: { $in: saved.map((s) => s.job) } }).lean<JobLean[]>();
  const byId = new Map(jobs.map((j) => [j._id.toString(), j]));
  const flags = await candidateFlags(jobs, candidateId);
  return {
    jobs: saved
      .map((s) => byId.get(s.job.toString()))
      .filter((j): j is JobLean => Boolean(j))
      .map((j) => ({ ...serializeJobCard(j, { ...(flags.get(j._id.toString()) ?? {}), isSaved: true }) })),
    meta: buildMeta(pagination, total),
  };
}

// ─── reporting ─────────────────────────────────────────────────────────────

export async function reportJob(
  reporterId: string,
  jobId: string,
  input: { reason: string; details?: string | undefined },
) {
  const job = await Job.findById(jobId).select('status').lean();
  if (!job || job.status === 'removed' || job.status === 'draft') {
    throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  }
  try {
    const report = await Report.create({
      reporter: reporterId,
      targetType: 'job',
      targetId: job._id,
      reason: input.reason,
      details: input.details,
    });
    return { id: report._id.toString(), status: report.status };
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      throw AppError.conflict('You have already reported this job', 'ALREADY_REPORTED');
    }
    throw err;
  }
}
