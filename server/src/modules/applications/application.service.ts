import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env';
import { Application, type ApplicationAttrs } from '../../models/Application';
import { CandidateProfile } from '../../models/CandidateProfile';
import { Job } from '../../models/Job';
import { Resume } from '../../models/Resume';
import { User } from '../../models/User';
import { sendPreferredEmail } from '../../services/email/email.service';
import { notify } from '../../services/notification.service';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import {
  APPLICATION_TRANSITIONS,
  WITHDRAWABLE_STATUSES,
  type ApplicationStatus,
} from '../../utils/constants';
import { buildMeta, toSkip } from '../../utils/pagination';
import { serializeResume } from '../candidates/candidate.service';
import { acceptsApplications, isExpired, serializeJobCard, type JobLean } from '../jobs/job.service';
import type {
  ApplicantsQuery,
  ApplyInput,
  MyApplicationsQuery,
  RecruiterApplicationsQuery,
  RecruiterNotesInput,
  UpdateStatusInput,
} from './application.validation';
import { escapeRegex } from '../../utils/validation';
import { assertScope, getRecruiterScope } from '../../services/team.service';

type ApplicationLean = ApplicationAttrs & { _id: Types.ObjectId };

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  interview: 'Interview scheduled',
  selected: 'Selected',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

// ─── serializers ───────────────────────────────────────────────────────────

function serializeBase(app: ApplicationLean) {
  return {
    id: app._id.toString(),
    jobId: app.job.toString(),
    candidateId: app.candidate.toString(),
    status: app.status,
    statusLabel: STATUS_LABELS[app.status as ApplicationStatus],
    coverLetter: app.coverLetter ?? null,
    answers: app.answers.map((a) => ({ questionId: a.questionId.toString(), question: a.question, answer: a.answer })),
    statusHistory: app.statusHistory.map((h) => ({ status: h.status, changedAt: h.changedAt, note: h.note ?? null })),
    interview: app.interview ?? null,
    withdrawnAt: app.withdrawnAt ?? null,
    appliedAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

/** Candidate-facing view: no recruiter notes or rating. */
function serializeForCandidate(app: ApplicationLean, job: JobLean | undefined, resume: Parameters<typeof serializeResume>[0] | null) {
  return {
    ...serializeBase(app),
    job: job ? serializeJobCard(job) : null,
    resume: resume ? serializeResume(resume) : null,
    canWithdraw: WITHDRAWABLE_STATUSES.includes(app.status as ApplicationStatus),
  };
}

// ─── apply ─────────────────────────────────────────────────────────────────

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export async function applyToJob(
  candidate: Express.AuthUser,
  jobId: string,
  input: ApplyInput,
  file: UploadedFile | undefined,
) {
  const job = await Job.findById(jobId).lean<JobLean>();
  if (!job || job.status === 'removed' || job.status === 'draft') {
    throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  }
  if (!acceptsApplications(job)) {
    throw AppError.badRequest(
      isExpired(job) ? 'The application deadline for this job has passed' : 'This job is no longer accepting applications',
      'JOB_NOT_ACCEPTING',
    );
  }

  const profile = await CandidateProfile.findOne({ user: candidate.id });
  if (!profile) throw AppError.notFound('Candidate profile not found', 'PROFILE_NOT_FOUND');

  const existing = await Application.exists({ job: job._id, candidate: candidate.id });
  if (existing) throw AppError.conflict('You have already applied to this job', 'ALREADY_APPLIED');

  // ── resolve resume: uploaded file > explicit resumeId > active resume ──
  let resumeId: Types.ObjectId;
  if (file) {
    const stored = await storageService.uploadResume(file.buffer, candidate.id);
    const resume = await Resume.create({
      user: candidate.id,
      publicId: stored.publicId,
      originalName: file.originalname.slice(0, 255),
      size: file.size,
      mimeType: file.mimetype,
    });
    resumeId = resume._id;
    if (!profile.activeResume) {
      profile.activeResume = resume._id;
      await profile.save();
    }
  } else {
    const chosen = input.resumeId ?? profile.activeResume?.toString();
    if (!chosen) {
      throw AppError.badRequest('Upload a resume or choose one from your profile', 'RESUME_REQUIRED');
    }
    const resume = await Resume.findOne({ _id: chosen, user: candidate.id, deletedAt: null }).select('_id').lean();
    if (!resume) throw AppError.notFound('Resume not found', 'RESUME_NOT_FOUND');
    resumeId = resume._id;
  }

  // ── validate custom question answers against the job's definition ──
  const answersById = new Map(input.answers.map((a) => [a.questionId, a.answer]));
  const answers: { questionId: Types.ObjectId; question: string; answer: string }[] = [];
  const problems: { field: string; message: string }[] = [];

  for (const q of job.customQuestions) {
    const qid = q._id.toString();
    const raw = answersById.get(qid)?.trim();
    if (!raw) {
      if (q.required) problems.push({ field: `answers.${qid}`, message: `"${q.question}" is required` });
      continue;
    }
    if (q.type === 'select' && !q.options.includes(raw)) {
      problems.push({ field: `answers.${qid}`, message: `Choose one of: ${q.options.join(', ')}` });
      continue;
    }
    if (q.type === 'boolean' && !['true', 'false', 'yes', 'no'].includes(raw.toLowerCase())) {
      problems.push({ field: `answers.${qid}`, message: 'Answer must be yes or no' });
      continue;
    }
    answers.push({ questionId: q._id, question: q.question, answer: raw });
  }
  for (const key of answersById.keys()) {
    if (!job.customQuestions.some((q) => q._id.toString() === key)) {
      problems.push({ field: `answers.${key}`, message: 'Unknown question' });
    }
  }
  if (problems.length) throw AppError.badRequest('Please answer the application questions', 'VALIDATION_ERROR', problems);

  // ── create ──
  let application;
  try {
    application = await Application.create({
      job: job._id,
      candidate: candidate.id,
      recruiter: job.recruiter,
      resume: resumeId,
      coverLetter: input.coverLetter,
      answers,
      status: 'applied',
      statusHistory: [{ status: 'applied', changedBy: candidate.id, changedAt: new Date() }],
    });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      throw AppError.conflict('You have already applied to this job', 'ALREADY_APPLIED');
    }
    throw err;
  }
  await Job.updateOne({ _id: job._id }, { $inc: { applicationCount: 1 } });

  // ── side effects (never block the response) ──
  const appLink = `/candidate/applications/${application._id}`;
  void notify(candidate.id, {
    type: 'application_submitted',
    title: 'Application submitted',
    message: `Your application for ${job.title} at ${job.companyName} was received.`,
    link: appLink,
    meta: { jobId: job._id, applicationId: application._id },
  });
  void notify(job.recruiter, {
    type: 'new_applicant',
    title: 'New applicant',
    message: `${profile.fullName} applied for ${job.title}.`,
    link: `/recruiter/jobs/${job._id}/applicants`,
    meta: { jobId: job._id, applicationId: application._id },
  });
  void sendPreferredEmail(candidate.id, 'applicationConfirmation', candidate.email, {
    name: profile.fullName,
    jobTitle: job.title,
    company: job.companyName,
    url: `${env.CLIENT_URL}${appLink}`,
  });

  const resume = await Resume.findById(resumeId).lean();
  return serializeForCandidate(application.toObject(), job, resume);
}

// ─── candidate reads ───────────────────────────────────────────────────────

export async function listMyApplications(candidateId: string, query: MyApplicationsQuery) {
  const filter: FilterQuery<ApplicationAttrs> = { candidate: candidateId };
  if (query.status?.length) filter.status = { $in: query.status };

  const [apps, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit).lean<ApplicationLean[]>(),
    Application.countDocuments(filter),
  ]);
  const jobs = await Job.find({ _id: { $in: apps.map((a) => a.job) } }).lean<JobLean[]>();
  const byId = new Map(jobs.map((j) => [j._id.toString(), j]));

  return {
    applications: apps.map((a) => serializeForCandidate(a, byId.get(a.job.toString()), null)),
    meta: buildMeta(query, total),
  };
}

export async function getApplication(applicationId: string, viewer: Express.AuthUser) {
  const app = await Application.findById(applicationId).lean<ApplicationLean>();
  if (!app) throw AppError.notFound('Application not found', 'APPLICATION_NOT_FOUND');

  const isCandidate = viewer.role === 'candidate' && app.candidate.toString() === viewer.id;
  const isRecruiter = viewer.role === 'recruiter' && (app.recruiter.toString() === viewer.id || (await getRecruiterScope(viewer.id)).roles.has(app.recruiter.toString()));
  const isAdmin = viewer.role === 'admin';
  if (!isCandidate && !isRecruiter && !isAdmin) throw AppError.forbidden();

  const [job, resume] = await Promise.all([
    Job.findById(app.job).lean<JobLean>(),
    Resume.findById(app.resume).lean(),
  ]);

  if (isCandidate) {
    return { application: serializeForCandidate(app, job ?? undefined, resume) };
  }

  // Recruiter / admin view: candidate summary + signed resume URL + private notes.
  const [profile, user] = await Promise.all([
    CandidateProfile.findOne({ user: app.candidate }).lean(),
    User.findById(app.candidate).select('email').lean(),
  ]);
  return {
    application: {
      ...serializeBase(app),
      job: job ? serializeJobCard(job, {}, { owner: true }) : null,
      candidate: profile
        ? {
            id: app.candidate.toString(),
            fullName: profile.fullName,
            email: user?.email,
            headline: profile.headline ?? null,
            phone: profile.phone ?? null,
            location: profile.location ?? {},
            skills: profile.skills,
            totalExperienceYears: profile.totalExperienceYears ?? null,
            photoUrl: storageService.getImageUrl(profile.photoPublicId),
            linkedinUrl: profile.linkedinUrl ?? null,
            githubUrl: profile.githubUrl ?? null,
            portfolioUrl: profile.portfolioUrl ?? null,
          }
        : null,
      resume: resume ? serializeResume(resume, { withUrl: true }) : null,
      recruiterNotes: app.recruiterNotes ?? null,
      rating: app.rating ?? null,
      allowedTransitions: APPLICATION_TRANSITIONS[app.status as ApplicationStatus],
    },
  };
}

// ─── recruiter pipeline ────────────────────────────────────────────────────

export async function listApplicants(jobId: string, recruiterId: string, query: ApplicantsQuery) {
  const job = await Job.findById(jobId).select('recruiter title status').lean();
  if (!job) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (job.recruiter.toString() !== recruiterId) await assertScope(recruiterId, job.recruiter, 'view');

  const filter: FilterQuery<ApplicationAttrs> = { job: job._id };
  if (query.status?.length) filter.status = { $in: query.status };
  const sort: Record<string, 1 | -1> =
    query.sort === 'oldest' ? { createdAt: 1 } : query.sort === 'rating' ? { rating: -1, createdAt: -1 } : { createdAt: -1 };

  const [apps, total, statusCounts] = await Promise.all([
    Application.find(filter).sort(sort).skip(toSkip(query)).limit(query.limit).lean<ApplicationLean[]>(),
    Application.countDocuments(filter),
    Application.aggregate<{ _id: string; count: number }>([
      { $match: { job: job._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const candidateIds = apps.map((a) => a.candidate);
  const [profiles, users] = await Promise.all([
    CandidateProfile.find({ user: { $in: candidateIds } })
      .select('user fullName headline photoPublicId skills totalExperienceYears location')
      .lean(),
    User.find({ _id: { $in: candidateIds } }).select('email').lean(),
  ]);
  const profileBy = new Map(profiles.map((p) => [p.user.toString(), p]));
  const emailBy = new Map(users.map((u) => [u._id.toString(), u.email]));

  return {
    job: { id: job._id.toString(), title: job.title, status: job.status },
    applicants: apps.map((a) => {
      const p = profileBy.get(a.candidate.toString());
      return {
        ...serializeBase(a),
        rating: a.rating ?? null,
        hasNotes: Boolean(a.recruiterNotes),
        candidate: p
          ? {
              id: a.candidate.toString(),
              fullName: p.fullName,
              email: emailBy.get(a.candidate.toString()),
              headline: p.headline ?? null,
              photoUrl: storageService.getImageUrl(p.photoPublicId),
              skills: p.skills,
              totalExperienceYears: p.totalExperienceYears ?? null,
              location: p.location ?? {},
            }
          : null,
      };
    }),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
    meta: buildMeta(query, total),
  };
}

/** Every application across all of a recruiter's jobs (the "Applicants" workspace). */
export async function listRecruiterApplications(recruiterId: string, query: RecruiterApplicationsQuery) {
  const scope = await getRecruiterScope(recruiterId);
  const filter: FilterQuery<ApplicationAttrs> = { recruiter: { $in: scope.ownerIds } };
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.job) filter.job = query.job;
  if (query.q) {
    const re = { $regex: escapeRegex(query.q), $options: 'i' };
    const matches = await CandidateProfile.find({ $or: [{ fullName: re }, { headline: re }, { skills: re }] }).select('user').lean();
    filter.candidate = { $in: matches.map((m) => m.user) };
  }
  const sort: Record<string, 1 | -1> =
    query.sort === 'oldest' ? { createdAt: 1 } : query.sort === 'rating' ? { rating: -1, createdAt: -1 } : { createdAt: -1 };

  const [apps, total, statusCounts] = await Promise.all([
    Application.find(filter).sort(sort).skip(toSkip(query)).limit(query.limit).lean<ApplicationLean[]>(),
    Application.countDocuments(filter),
    Application.aggregate<{ _id: string; count: number }>([
      { $match: { recruiter: { $in: scope.ownerIds }, ...(query.job ? { job: new Types.ObjectId(query.job) } : {}) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const candidateIds = apps.map((a) => a.candidate);
  const [profiles, users, jobs] = await Promise.all([
    CandidateProfile.find({ user: { $in: candidateIds } }).select('user fullName headline photoPublicId skills totalExperienceYears location').lean(),
    User.find({ _id: { $in: candidateIds } }).select('email').lean(),
    Job.find({ _id: { $in: apps.map((a) => a.job) } }).select('title status companyName').lean(),
  ]);
  const profileBy = new Map(profiles.map((p) => [p.user.toString(), p]));
  const emailBy = new Map(users.map((u) => [u._id.toString(), u.email]));
  const jobBy = new Map(jobs.map((j) => [j._id.toString(), j]));

  return {
    applicants: apps.map((a) => {
      const p = profileBy.get(a.candidate.toString());
      const j = jobBy.get(a.job.toString());
      return {
        ...serializeBase(a),
        rating: a.rating ?? null,
        hasNotes: Boolean(a.recruiterNotes),
        job: j ? { id: j._id.toString(), title: j.title, status: j.status } : null,
        candidate: p
          ? {
              id: a.candidate.toString(),
              fullName: p.fullName,
              email: emailBy.get(a.candidate.toString()),
              headline: p.headline ?? null,
              photoUrl: storageService.getImageUrl(p.photoPublicId),
              skills: p.skills,
              totalExperienceYears: p.totalExperienceYears ?? null,
              location: p.location ?? {},
            }
          : null,
      };
    }),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
    meta: buildMeta(query, total),
  };
}

export async function loadOwnedApplication(applicationId: string, recruiterId: string) {
  const app = await Application.findById(applicationId);
  if (!app) throw AppError.notFound('Application not found', 'APPLICATION_NOT_FOUND');
  if (!app.recruiter.equals(recruiterId)) await assertScope(recruiterId, app.recruiter, 'review');
  return app;
}

export async function updateStatus(applicationId: string, recruiter: Express.AuthUser, input: UpdateStatusInput) {
  const app = await loadOwnedApplication(applicationId, recruiter.id);
  const current = app.status as ApplicationStatus;
  if (!APPLICATION_TRANSITIONS[current].includes(input.status)) {
    throw AppError.badRequest(
      `Cannot move an application from "${STATUS_LABELS[current]}" to "${STATUS_LABELS[input.status]}"`,
      'INVALID_STATUS_TRANSITION',
    );
  }

  app.status = input.status;
  app.statusHistory.push({ status: input.status, changedBy: new Types.ObjectId(recruiter.id), changedAt: new Date(), note: input.note });
  if (input.status === 'interview' && input.interview) app.interview = input.interview;
  await app.save();

  // ── notify candidate (in-app + email) ──
  const [job, profile, user] = await Promise.all([
    Job.findById(app.job).select('title companyName').lean(),
    CandidateProfile.findOne({ user: app.candidate }).select('fullName').lean(),
    User.findById(app.candidate).select('email').lean(),
  ]);
  const link = `/candidate/applications/${app._id}`;
  const label = STATUS_LABELS[input.status];

  if (job && user) {
    if (input.status === 'interview' && input.interview) {
      const when = input.interview.scheduledAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
      void notify(app.candidate, {
        type: 'interview_scheduled',
        title: 'Interview scheduled',
        message: `${job.companyName} scheduled an interview for ${job.title} on ${when}.`,
        link,
        meta: { jobId: app.job, applicationId: app._id },
      });
      void sendPreferredEmail(app.candidate, 'interviewScheduled', user.email, {
        name: profile?.fullName ?? 'there',
        jobTitle: job.title,
        company: job.companyName,
        when: `${when} (IST)`,
        mode: input.interview.mode,
        where: input.interview.meetingLink ?? input.interview.location,
        notes: input.interview.notes,
        url: `${env.CLIENT_URL}${link}`,
      });
    } else {
      void notify(app.candidate, {
        type: 'application_status',
        title: `Application ${label.toLowerCase()}`,
        message: `Your application for ${job.title} at ${job.companyName} is now: ${label}.`,
        link,
        meta: { jobId: app.job, applicationId: app._id },
      });
      void sendPreferredEmail(app.candidate, 'applicationStatus', user.email, {
        name: profile?.fullName ?? 'there',
        jobTitle: job.title,
        company: job.companyName,
        statusLabel: label,
        note: input.note,
        url: `${env.CLIENT_URL}${link}`,
      });
    }
  }

  return getApplication(app._id.toString(), recruiter);
}

export async function updateRecruiterNotes(applicationId: string, recruiter: Express.AuthUser, input: RecruiterNotesInput) {
  const app = await loadOwnedApplication(applicationId, recruiter.id);
  if (input.recruiterNotes !== undefined) app.recruiterNotes = input.recruiterNotes;
  if (input.rating !== undefined) app.rating = input.rating ?? undefined;
  await app.save();
  return getApplication(app._id.toString(), recruiter);
}

// ─── candidate withdraw ────────────────────────────────────────────────────

export async function withdraw(applicationId: string, candidate: Express.AuthUser) {
  const app = await Application.findById(applicationId);
  if (!app) throw AppError.notFound('Application not found', 'APPLICATION_NOT_FOUND');
  if (!app.candidate.equals(candidate.id)) throw AppError.forbidden();
  if (!WITHDRAWABLE_STATUSES.includes(app.status as ApplicationStatus)) {
    throw AppError.badRequest(
      `An application that is "${STATUS_LABELS[app.status as ApplicationStatus]}" cannot be withdrawn`,
      'NOT_WITHDRAWABLE',
    );
  }

  app.status = 'withdrawn';
  app.withdrawnAt = new Date();
  app.statusHistory.push({ status: 'withdrawn', changedBy: new Types.ObjectId(candidate.id), changedAt: new Date() });
  await app.save();
  await Job.updateOne({ _id: app.job, applicationCount: { $gt: 0 } }, { $inc: { applicationCount: -1 } });

  const [job, profile] = await Promise.all([
    Job.findById(app.job).select('title').lean(),
    CandidateProfile.findOne({ user: candidate.id }).select('fullName').lean(),
  ]);
  if (job) {
    void notify(app.recruiter, {
      type: 'application_withdrawn',
      title: 'Application withdrawn',
      message: `${profile?.fullName ?? 'A candidate'} withdrew their application for ${job.title}.`,
      link: `/recruiter/jobs/${app.job}/applicants`,
      meta: { jobId: app.job, applicationId: app._id },
    });
  }
  return getApplication(app._id.toString(), candidate);
}
