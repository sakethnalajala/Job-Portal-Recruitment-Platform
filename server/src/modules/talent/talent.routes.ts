import { Router, type Request, type Response } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { Application } from '../../models/Application';
import { CandidateProfile } from '../../models/CandidateProfile';
import { SavedCandidate, type SavedCandidateAttrs } from '../../models/SavedCandidate';
import { User } from '../../models/User';
import { storageService } from '../../services/storage.service';
import { getRecruiterScope } from '../../services/team.service';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import { buildMeta, paginationQuerySchema, toSkip } from '../../utils/pagination';
import { escapeRegex, idParamSchema, objectIdSchema, optionalTrimmed } from '../../utils/validation';

/**
 * Talent pool — a recruiter's personal shortlist of candidates. A candidate can
 * only be saved if they applied to a job the recruiter (or their team) owns, the
 * same rule that governs viewing candidate profiles.
 */
export const talentRouter = Router();
talentRouter.use(authenticate, authorize('recruiter'));

const category = z.string().trim().toLowerCase().min(1).max(40).regex(/^[a-z0-9 _-]+$/, 'Letters, numbers, spaces and dashes only');
const tags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(15);
const saveSchema = z.object({ candidateId: objectIdSchema, category: category.default('general'), tags: tags.default([]), notes: optionalTrimmed(3000), rating: z.number().int().min(1).max(5).optional(), sourceApplication: objectIdSchema.optional() });
const updateSchema = z.object({ category, tags, notes: optionalTrimmed(3000), rating: z.number().int().min(1).max(5).nullable() }).partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
const listSchema = paginationQuerySchema.extend({ category: z.string().trim().toLowerCase().max(40).optional(), q: z.string().trim().max(100).optional(), tag: z.string().trim().toLowerCase().max(30).optional(), sort: z.enum(['recent', 'name', 'rating']).default('recent') });
type ListQuery = z.infer<typeof listSchema>;
type Lean = SavedCandidateAttrs & { _id: Types.ObjectId };

async function assertCanSave(recruiterId: string, candidateId: string) {
  const scope = await getRecruiterScope(recruiterId);
  const applied = await Application.exists({ candidate: candidateId, recruiter: { $in: scope.ownerIds } });
  if (!applied) throw AppError.forbidden('You can only save candidates who applied to one of your jobs', 'CANDIDATE_NOT_APPLICANT');
}

async function decorate(rows: Lean[], recruiterId: string) {
  const ids = rows.map((r) => r.candidate);
  const scope = await getRecruiterScope(recruiterId);
  const [profiles, users, latestApps] = await Promise.all([
    CandidateProfile.find({ user: { $in: ids } }).select('user fullName headline photoPublicId skills totalExperienceYears location').lean(),
    User.find({ _id: { $in: ids } }).select('email status').lean(),
    Application.aggregate<{ _id: Types.ObjectId; applicationId: Types.ObjectId; status: string; jobTitle?: string }>([
      { $match: { candidate: { $in: ids }, recruiter: { $in: scope.ownerIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$candidate', applicationId: { $first: '$_id' }, status: { $first: '$status' }, job: { $first: '$job' } } },
      { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'j' } },
      { $project: { applicationId: 1, status: 1, jobTitle: { $arrayElemAt: ['$j.title', 0] } } },
    ]),
  ]);
  const pBy = new Map(profiles.map((p) => [p.user.toString(), p]));
  const uBy = new Map(users.map((u) => [u._id.toString(), u]));
  const aBy = new Map(latestApps.map((a) => [a._id.toString(), a]));
  return rows.map((r) => {
    const p = pBy.get(r.candidate.toString());
    const u = uBy.get(r.candidate.toString());
    const a = aBy.get(r.candidate.toString());
    return {
      id: r._id.toString(),
      candidateId: r.candidate.toString(),
      category: r.category,
      tags: r.tags,
      notes: r.notes ?? null,
      rating: r.rating ?? null,
      savedAt: r.createdAt,
      updatedAt: r.updatedAt,
      candidate: p ? { fullName: p.fullName, email: u?.email ?? null, headline: p.headline ?? null, photoUrl: storageService.getImageUrl(p.photoPublicId), skills: p.skills, totalExperienceYears: p.totalExperienceYears ?? null, location: p.location ?? {}, isActive: u?.status === 'active' } : null,
      latestApplication: a ? { id: a.applicationId.toString(), status: a.status, jobTitle: a.jobTitle ?? null } : null,
    };
  });
}

talentRouter.get('/', validate({ query: listSchema }), asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListQuery;
  const filter: FilterQuery<SavedCandidateAttrs> = { recruiter: req.user!.id };
  if (q.category) filter.category = q.category;
  if (q.tag) filter.tags = q.tag;
  if (q.q) {
    const re = { $regex: escapeRegex(q.q), $options: 'i' };
    const matches = await CandidateProfile.find({ $or: [{ fullName: re }, { headline: re }, { skills: re }] }).select('user').lean();
    filter.$or = [{ candidate: { $in: matches.map((m) => m.user) } }, { notes: re }, { tags: re }];
  }
  const sort: Record<string, 1 | -1> = q.sort === 'rating' ? { rating: -1, updatedAt: -1 } : { updatedAt: -1 };
  const [rows, total, categories] = await Promise.all([
    SavedCandidate.find(filter).sort(sort).skip(toSkip(q)).limit(q.limit).lean<Lean[]>(),
    SavedCandidate.countDocuments(filter),
    SavedCandidate.aggregate<{ _id: string; count: number }>([{ $match: { recruiter: new Types.ObjectId(req.user!.id) } }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  let items = await decorate(rows, req.user!.id);
  if (q.sort === 'name') items = items.sort((a, b) => (a.candidate?.fullName ?? '').localeCompare(b.candidate?.fullName ?? ''));
  sendSuccess(res, { candidates: items, categories: categories.map((c) => ({ name: c._id, count: c.count })) }, { meta: buildMeta(q, total) });
}));

talentRouter.post('/', validate({ body: saveSchema }), asyncHandler(async (req: Request, res: Response) => {
  await assertCanSave(req.user!.id, req.body.candidateId);
  try {
    const doc = await SavedCandidate.create({ recruiter: req.user!.id, candidate: req.body.candidateId, category: req.body.category, tags: req.body.tags, notes: req.body.notes, rating: req.body.rating, sourceApplication: req.body.sourceApplication });
    sendCreated(res, { entry: (await decorate([doc.toObject()], req.user!.id))[0] }, 'Candidate saved to your talent pool');
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) throw AppError.conflict('This candidate is already in your talent pool', 'ALREADY_SAVED');
    throw err;
  }
}));

talentRouter.get('/check/:id', validate({ params: idParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const entry = await SavedCandidate.findOne({ recruiter: req.user!.id, candidate: req.params.id }).lean<Lean>();
  sendSuccess(res, { saved: Boolean(entry), entry: entry ? (await decorate([entry], req.user!.id))[0] : null });
}));

talentRouter.patch('/:id', validate({ params: idParamSchema, body: updateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const doc = await SavedCandidate.findOne({ _id: req.params.id, recruiter: req.user!.id });
  if (!doc) throw AppError.notFound('Talent pool entry not found', 'ENTRY_NOT_FOUND');
  for (const [k, v] of Object.entries(req.body)) doc.set(k, v === null ? undefined : v);
  await doc.save();
  sendSuccess(res, { entry: (await decorate([doc.toObject()], req.user!.id))[0] }, { message: 'Saved' });
}));

talentRouter.delete('/:id', validate({ params: idParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const r = await SavedCandidate.deleteOne({ _id: req.params.id, recruiter: req.user!.id });
  if (r.deletedCount === 0) throw AppError.notFound('Talent pool entry not found', 'ENTRY_NOT_FOUND');
  sendNoContent(res);
}));
