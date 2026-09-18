import type { Types } from 'mongoose';
import { Job } from '../../models/Job';
import { RecruiterProfile } from '../../models/RecruiterProfile';
import { User } from '../../models/User';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import type { UpdateRecruiterProfileInput } from './recruiter.validation';

type RecruiterProfileLike = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  fullName: string;
  companyName: string;
  companyDescription?: string | null;
  logoPublicId?: string | null;
  photoPublicId?: string | null;
  industry?: string | null;
  website?: string | null;
  companySize?: string | null;
  location?: { city?: string | null; country?: string | null } | null;
  phone?: string | null;
  isVerified: boolean;
  verifiedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export function serializeRecruiterProfile(
  profile: RecruiterProfileLike,
  extra: { email?: string; isEmailVerified?: boolean; openJobs?: number } = {},
) {
  return {
    id: profile._id.toString(),
    user: profile.user.toString(),
    fullName: profile.fullName,
    companyName: profile.companyName,
    companyDescription: profile.companyDescription ?? undefined,
    logoUrl: storageService.getImageUrl(profile.logoPublicId),
    photoUrl: storageService.getImageUrl(profile.photoPublicId),
    industry: profile.industry ?? undefined,
    website: profile.website ?? undefined,
    companySize: profile.companySize ?? undefined,
    location: profile.location ?? {},
    phone: profile.phone ?? undefined,
    isVerified: profile.isVerified,
    verifiedAt: profile.verifiedAt ?? undefined,
    createdAt: profile.createdAt,
    ...(extra.email ? { email: extra.email, isEmailVerified: extra.isEmailVerified } : {}),
    ...(extra.openJobs !== undefined ? { openJobs: extra.openJobs } : {}),
  };
}

/** Public company card: no contact details. */
export function serializeCompanyCard(profile: RecruiterProfileLike, openJobs?: number) {
  const full = serializeRecruiterProfile(profile, { openJobs });
  const { phone, fullName, photoUrl, ...card } = full;
  void phone;
  void fullName;
  void photoUrl;
  return card;
}

async function loadOwnProfile(userId: string) {
  const profile = await RecruiterProfile.findOne({ user: userId });
  if (!profile) throw AppError.notFound('Recruiter profile not found', 'PROFILE_NOT_FOUND');
  return profile;
}

export async function getOwnProfile(userId: string) {
  const [profile, user, openJobs] = await Promise.all([
    loadOwnProfile(userId),
    User.findById(userId).select('email isEmailVerified').lean(),
    Job.countDocuments({ recruiter: userId, status: 'open' }),
  ]);
  return serializeRecruiterProfile(profile, {
    email: user?.email,
    isEmailVerified: user?.isEmailVerified,
    openJobs,
  });
}

/** Keeps the denormalized company snapshot on jobs in sync. */
async function syncJobSnapshots(profile: Awaited<ReturnType<typeof loadOwnProfile>>) {
  await Job.updateMany(
    { recruiter: profile.user },
    {
      $set: {
        companyName: profile.companyName,
        companyLogoPublicId: profile.logoPublicId ?? null,
        companyVerified: profile.isVerified,
      },
    },
  );
}

export async function updateOwnProfile(userId: string, input: UpdateRecruiterProfileInput) {
  const profile = await loadOwnProfile(userId);
  profile.set(input);
  await profile.save();
  if (input.companyName !== undefined) await syncJobSnapshots(profile);
  return getOwnProfile(userId);
}

export async function uploadLogo(userId: string, buffer: Buffer) {
  const profile = await loadOwnProfile(userId);
  const stored = await storageService.uploadImage(buffer, 'logos', userId);
  profile.logoPublicId = stored.publicId;
  await profile.save();
  await syncJobSnapshots(profile);
  return { logoUrl: storageService.getImageUrl(stored.publicId) };
}

export async function uploadPhoto(userId: string, buffer: Buffer) {
  const profile = await loadOwnProfile(userId);
  const stored = await storageService.uploadImage(buffer, 'avatars', userId);
  profile.photoPublicId = stored.publicId;
  await profile.save();
  return { photoUrl: storageService.getImageUrl(stored.publicId) };
}

export async function deletePhoto(userId: string) {
  const profile = await loadOwnProfile(userId);
  if (profile.photoPublicId) {
    await storageService.deleteImage(profile.photoPublicId);
    profile.photoPublicId = undefined;
    await profile.save();
  }
}

export async function deleteLogo(userId: string) {
  const profile = await loadOwnProfile(userId);
  if (profile.logoPublicId) {
    await storageService.deleteImage(profile.logoPublicId);
    profile.logoPublicId = undefined;
    await profile.save();
    await syncJobSnapshots(profile);
  }
}

/** Public company page, keyed by recruiter profile id. */
export async function getPublicCompany(profileId: string) {
  const profile = await RecruiterProfile.findById(profileId).lean();
  if (!profile) throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
  const user = await User.findById(profile.user).select('status').lean();
  if (!user || user.status !== 'active') throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
  const openJobs = await Job.countDocuments({ recruiter: profile.user, status: 'open' });
  return serializeCompanyCard(profile, openJobs);
}
