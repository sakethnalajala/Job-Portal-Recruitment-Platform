import { Types } from 'mongoose';
import { Application } from '../../models/Application';
import { CandidateProfile, type CandidateProfileAttrs } from '../../models/CandidateProfile';
import { Resume } from '../../models/Resume';
import { User } from '../../models/User';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import type { UpdateCandidateProfileInput } from './candidate.validation';

// ─── serializers ───────────────────────────────────────────────────────────

type ResumeLike = {
  _id: Types.ObjectId;
  publicId: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt?: Date;
  deletedAt?: Date | null;
};

export function serializeResume(resume: ResumeLike, opts: { withUrl?: boolean } = {}) {
  return {
    id: resume._id.toString(),
    originalName: resume.originalName,
    size: resume.size,
    mimeType: resume.mimeType,
    uploadedAt: resume.createdAt,
    ...(opts.withUrl ? { downloadUrl: storageService.getResumeSignedUrl(resume.publicId, resume.originalName) } : {}),
  };
}

type ProfileLean = CandidateProfileAttrs & { _id: Types.ObjectId; __v?: number };

export function serializeCandidateProfile(
  p: ProfileLean,
  extra: { email?: string | undefined; isEmailVerified?: boolean | undefined; activeResume?: ResumeLike | null } = {},
) {
  const { photoPublicId, __v, ...rest } = p;
  void __v;
  return {
    ...rest,
    id: p._id.toString(),
    user: p.user.toString(),
    photoUrl: storageService.getImageUrl(photoPublicId),
    activeResume: extra.activeResume ? serializeResume(extra.activeResume) : null,
    ...(extra.email ? { email: extra.email, isEmailVerified: extra.isEmailVerified } : {}),
  };
}

// ─── profile ───────────────────────────────────────────────────────────────

async function loadOwnProfile(userId: string) {
  const profile = await CandidateProfile.findOne({ user: userId });
  if (!profile) throw AppError.notFound('Candidate profile not found', 'PROFILE_NOT_FOUND');
  return profile;
}

export async function getOwnProfile(userId: string) {
  const [profile, user] = await Promise.all([
    loadOwnProfile(userId),
    User.findById(userId).select('email isEmailVerified').lean(),
  ]);
  const activeResume = profile.activeResume
    ? await Resume.findOne({ _id: profile.activeResume, deletedAt: null }).lean()
    : null;
  return serializeCandidateProfile(profile.toObject(), {
    email: user?.email,
    isEmailVerified: user?.isEmailVerified,
    activeResume,
  });
}

export async function updateOwnProfile(userId: string, input: UpdateCandidateProfileInput) {
  const profile = await loadOwnProfile(userId);
  profile.set(input);
  await profile.save(); // pre-save hook recomputes completion
  return getOwnProfile(userId);
}

export async function uploadPhoto(userId: string, buffer: Buffer) {
  const profile = await loadOwnProfile(userId);
  const stored = await storageService.uploadImage(buffer, 'avatars', userId);
  profile.photoPublicId = stored.publicId;
  await profile.save();
  return { photoUrl: storageService.getImageUrl(stored.publicId), completion: profile.completion };
}

export async function deletePhoto(userId: string) {
  const profile = await loadOwnProfile(userId);
  if (profile.photoPublicId) {
    await storageService.deleteImage(profile.photoPublicId);
    profile.photoPublicId = undefined;
    await profile.save();
  }
}

// ─── resumes ───────────────────────────────────────────────────────────────

const MAX_RESUMES = 5;

export async function listResumes(userId: string) {
  const [resumes, profile] = await Promise.all([
    Resume.find({ user: userId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
    CandidateProfile.findOne({ user: userId }).select('activeResume').lean(),
  ]);
  const activeId = profile?.activeResume?.toString();
  return resumes.map((r) => ({ ...serializeResume(r), isActive: r._id.toString() === activeId }));
}

export async function uploadResume(
  userId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  setActive: boolean,
) {
  const profile = await loadOwnProfile(userId);
  const count = await Resume.countDocuments({ user: userId, deletedAt: null });
  if (count >= MAX_RESUMES) {
    throw AppError.badRequest(`You can keep at most ${MAX_RESUMES} resumes. Delete one first.`, 'RESUME_LIMIT');
  }

  const stored = await storageService.uploadResume(file.buffer, userId);
  const resume = await Resume.create({
    user: userId,
    publicId: stored.publicId,
    originalName: file.originalname.slice(0, 255),
    size: file.size,
    mimeType: file.mimetype,
  });

  if (setActive || !profile.activeResume) {
    profile.activeResume = resume._id;
    await profile.save();
  }
  return { ...serializeResume(resume), isActive: profile.activeResume?.equals(resume._id) ?? false };
}

async function loadOwnResume(userId: string, resumeId: string) {
  const resume = await Resume.findOne({ _id: resumeId, user: userId, deletedAt: null });
  if (!resume) throw AppError.notFound('Resume not found', 'RESUME_NOT_FOUND');
  return resume;
}

export async function setActiveResume(userId: string, resumeId: string) {
  const [profile, resume] = await Promise.all([loadOwnProfile(userId), loadOwnResume(userId, resumeId)]);
  profile.activeResume = resume._id;
  await profile.save();
  return listResumes(userId);
}

export async function deleteResume(userId: string, resumeId: string) {
  const [profile, resume] = await Promise.all([loadOwnProfile(userId), loadOwnResume(userId, resumeId)]);

  const referenced = await Application.exists({ resume: resume._id });
  if (referenced) {
    // Keep the file: recruiters must still be able to open what was submitted.
    resume.deletedAt = new Date();
    await resume.save();
  } else {
    await storageService.deleteResume(resume.publicId);
    await resume.deleteOne();
  }

  if (profile.activeResume?.equals(resume._id)) {
    const next = await Resume.findOne({ user: userId, deletedAt: null }).sort({ createdAt: -1 });
    profile.activeResume = next?._id;
    await profile.save();
  }
}

export async function getOwnResumeDownloadUrl(userId: string, resumeId: string) {
  const resume = await loadOwnResume(userId, resumeId);
  return serializeResume(resume, { withUrl: true });
}

// ─── viewing another candidate ─────────────────────────────────────────────

/**
 * Recruiters may only view candidates who applied to one of their jobs.
 * Admins may view anyone.
 */
export async function getCandidateForViewer(candidateUserId: string, viewer: Express.AuthUser) {
  if (viewer.role === 'recruiter') {
    const applied = await Application.exists({ candidate: candidateUserId, recruiter: viewer.id });
    if (!applied) throw AppError.forbidden('You can only view candidates who applied to your jobs');
  } else if (viewer.role !== 'admin') {
    throw AppError.forbidden();
  }

  const [profile, user] = await Promise.all([
    CandidateProfile.findOne({ user: candidateUserId }).lean(),
    User.findById(candidateUserId).select('email status').lean(),
  ]);
  if (!profile || !user || user.status === 'deleted') {
    throw AppError.notFound('Candidate not found', 'CANDIDATE_NOT_FOUND');
  }
  return serializeCandidateProfile(profile, { email: user.email });
}
