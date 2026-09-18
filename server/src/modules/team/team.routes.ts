import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { Application } from '../../models/Application';
import { CandidateProfile } from '../../models/CandidateProfile';
import { Interview } from '../../models/Interview';
import { Job } from '../../models/Job';
import { RecruiterProfile } from '../../models/RecruiterProfile';
import { TeamMember, TEAM_ROLES, type TeamMemberAttrs } from '../../models/TeamMember';
import { User } from '../../models/User';
import { notify } from '../../services/notification.service';
import { getRecruiterScope } from '../../services/team.service';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import { idParamSchema, optionalTrimmed } from '../../utils/validation';
import { emailSchema } from '../auth/auth.validation';

/**
 * Company & team management. The signed-in recruiter is the team owner; team
 * admins may also manage members. Members with a linked recruiter account get
 * role-based access to the owner's jobs (see services/team.service).
 */
export const teamRouter = Router();
teamRouter.use(authenticate, authorize('recruiter'));

const inviteSchema = z.object({ email: emailSchema, name: optionalTrimmed(120), title: optionalTrimmed(120), role: z.enum(TEAM_ROLES).default('recruiter') });
const updateSchema = z.object({ role: z.enum(TEAM_ROLES), name: optionalTrimmed(120), title: optionalTrimmed(120) }).partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
type Lean = TeamMemberAttrs & { _id: Types.ObjectId };

/** Resolve which team the caller manages: their own, or the owner's if they are a team admin. */
async function resolveOwner(userId: string, forManage: boolean): Promise<Types.ObjectId> {
  const scope = await getRecruiterScope(userId);
  const own = await TeamMember.exists({ owner: userId });
  if (own || scope.ownerIds.length === 1) return new Types.ObjectId(userId);
  // Member of someone else's team and has no team of their own → act on that team.
  const [ownerId, role] = [...scope.roles.entries()].find(([id]) => id !== userId) ?? [];
  if (!ownerId) return new Types.ObjectId(userId);
  if (forManage && role !== 'admin') throw AppError.forbidden('Only the account owner or a team admin can manage members', 'TEAM_SCOPE');
  return new Types.ObjectId(ownerId);
}

const ROLE_PERMISSIONS = {
  owner: ['Full control', 'Manage team', 'Edit & publish jobs', 'Review applicants', 'Schedule interviews', 'Billing & company profile'],
  admin: ['Manage team', 'Edit & publish jobs', 'Review applicants', 'Schedule interviews'],
  recruiter: ['Review applicants', 'Change application stages', 'Schedule interviews', 'View all jobs'],
  viewer: ['View jobs and applicants', 'Read-only'],
} as const;

function serialize(m: Lean, ownerId: Types.ObjectId) {
  return { id: m._id.toString(), email: m.email, name: m.name ?? null, title: m.title ?? null, role: m.role, status: m.status, linked: Boolean(m.user), joinedAt: m.joinedAt ?? null, invitedAt: m.createdAt, isOwnerTeam: m.owner.equals(ownerId) };
}

teamRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const ownerId = await resolveOwner(req.user!.id, false);
  const [members, ownerUser, ownerProfile, myMemberships] = await Promise.all([
    TeamMember.find({ owner: ownerId, status: { $ne: 'removed' } }).sort({ createdAt: 1 }).lean<Lean[]>(),
    User.findById(ownerId).select('email lastLoginAt').lean(),
    RecruiterProfile.findOne({ user: ownerId }).select('fullName companyName').lean(),
    TeamMember.find({ user: req.user!.id, status: 'active' }).populate<{ owner: { _id: Types.ObjectId } }>('owner', '_id').lean(),
  ]);
  const scope = await getRecruiterScope(req.user!.id);
  sendSuccess(res, {
    owner: { id: ownerId.toString(), name: ownerProfile?.fullName ?? null, companyName: ownerProfile?.companyName ?? null, email: ownerUser?.email ?? null, lastLoginAt: ownerUser?.lastLoginAt ?? null, isYou: ownerId.equals(req.user!.id) },
    yourRole: scope.roles.get(ownerId.toString()) ?? 'owner',
    members: members.map((m) => serialize(m, ownerId)),
    permissions: ROLE_PERMISSIONS,
    memberOf: myMemberships.length,
  });
}));

teamRouter.post('/', validate({ body: inviteSchema }), asyncHandler(async (req: Request, res: Response) => {
  const ownerId = await resolveOwner(req.user!.id, true);
  const ownerUser = await User.findById(ownerId).select('email').lean();
  if (ownerUser?.email === req.body.email) throw AppError.badRequest('That is the account owner', 'OWNER_EMAIL');
  const existingUser = await User.findOne({ email: req.body.email, status: 'active' }).select('_id role').lean();
  if (existingUser && existingUser.role !== 'recruiter') throw AppError.badRequest('Only recruiter accounts can join a hiring team', 'NOT_RECRUITER');
  const current = await TeamMember.findOne({ owner: ownerId, email: req.body.email }).select('status').lean();
  if (current && current.status !== 'removed') throw AppError.conflict('This person is already on the team', 'ALREADY_MEMBER');
  const profile = await RecruiterProfile.findOne({ user: ownerId }).select('companyName').lean();
  let doc;
  try {
    doc = await TeamMember.findOneAndUpdate(
      { owner: ownerId, email: req.body.email },
      { $set: { name: req.body.name, title: req.body.title, role: req.body.role, invitedBy: req.user!.id, status: existingUser ? 'active' : 'invited', user: existingUser?._id, joinedAt: existingUser ? new Date() : undefined } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<Lean>();
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) throw AppError.conflict('This person is already on the team', 'ALREADY_MEMBER');
    throw err;
  }
  if (existingUser) {
    void notify(existingUser._id, { type: 'system', title: 'Added to a hiring team', message: `You were added to ${profile?.companyName ?? 'a company'}'s hiring team as ${req.body.role}.`, link: '/recruiter/company' });
  }
  sendCreated(res, { member: serialize(doc!, ownerId) }, existingUser ? 'Team member added' : 'Invitation recorded — access activates when they sign up as a recruiter with this email');
}));

teamRouter.patch('/:id', validate({ params: idParamSchema, body: updateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const ownerId = await resolveOwner(req.user!.id, true);
  const doc = await TeamMember.findOne({ _id: req.params.id, owner: ownerId, status: { $ne: 'removed' } });
  if (!doc) throw AppError.notFound('Team member not found', 'MEMBER_NOT_FOUND');
  doc.set(req.body);
  await doc.save();
  sendSuccess(res, { member: serialize(doc.toObject(), ownerId) }, { message: 'Team member updated' });
}));

teamRouter.delete('/:id', validate({ params: idParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const ownerId = await resolveOwner(req.user!.id, true);
  const doc = await TeamMember.findOne({ _id: req.params.id, owner: ownerId });
  if (!doc) throw AppError.notFound('Team member not found', 'MEMBER_NOT_FOUND');
  await doc.deleteOne();
  sendNoContent(res);
}));

/** Recent hiring activity across the company's jobs (real events from application history and interviews). */
teamRouter.get('/activity', asyncHandler(async (req: Request, res: Response) => {
  const scope = await getRecruiterScope(req.user!.id);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [stageChanges, newApps, interviews, jobs] = await Promise.all([
    Application.aggregate<{ _id: Types.ObjectId; job: Types.ObjectId; candidate: Types.ObjectId; h: { status: string; changedBy: Types.ObjectId; changedAt: Date } }>([
      { $match: { recruiter: { $in: scope.ownerIds } } },
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.changedAt': { $gte: since }, 'statusHistory.status': { $ne: 'applied' } } },
      { $project: { job: 1, candidate: 1, h: '$statusHistory' } },
      { $sort: { 'h.changedAt': -1 } },
      { $limit: 30 },
    ]),
    Application.countDocuments({ recruiter: { $in: scope.ownerIds }, createdAt: { $gte: since } }),
    Interview.find({ recruiter: { $in: scope.ownerIds }, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).select('scheduledBy candidate job scheduledAt status createdAt').lean(),
    Job.find({ recruiter: { $in: scope.ownerIds }, createdAt: { $gte: since } }).select('title status createdAt recruiter').lean(),
  ]);
  const actorIds = [...new Set([...stageChanges.map((s) => s.h.changedBy.toString()), ...interviews.map((i) => i.scheduledBy.toString()), ...jobs.map((j) => j.recruiter.toString())])];
  const [actors, candidates, jobDocs] = await Promise.all([
    RecruiterProfile.find({ user: { $in: actorIds } }).select('user fullName').lean(),
    CandidateProfile.find({ user: { $in: [...stageChanges.map((s) => s.candidate), ...interviews.map((i) => i.candidate)] } }).select('user fullName').lean(),
    Job.find({ _id: { $in: [...stageChanges.map((s) => s.job), ...interviews.map((i) => i.job)] } }).select('title').lean(),
  ]);
  const actorBy = new Map(actors.map((a) => [a.user.toString(), a.fullName]));
  const candBy = new Map(candidates.map((c) => [c.user.toString(), c.fullName]));
  const jobBy = new Map(jobDocs.map((j) => [j._id.toString(), j.title]));
  const events = [
    ...stageChanges.map((s) => ({ type: 'stage' as const, at: s.h.changedAt, actor: actorBy.get(s.h.changedBy.toString()) ?? 'Candidate', text: `${s.h.status === 'withdrawn' ? `${candBy.get(s.candidate.toString()) ?? 'A candidate'} withdrew from` : `moved ${candBy.get(s.candidate.toString()) ?? 'a candidate'} to ${s.h.status.replace('_', ' ')} for`} ${jobBy.get(s.job.toString()) ?? 'a job'}`, link: `/recruiter/applications/${s._id}` })),
    ...interviews.map((i) => ({ type: 'interview' as const, at: i.createdAt, actor: actorBy.get(i.scheduledBy.toString()) ?? 'Team', text: `scheduled an interview with ${candBy.get(i.candidate.toString()) ?? 'a candidate'} for ${jobBy.get(i.job.toString()) ?? 'a job'}`, link: '/recruiter/interviews' })),
    ...jobs.map((j) => ({ type: 'job' as const, at: j.createdAt, actor: actorBy.get(j.recruiter.toString()) ?? 'Team', text: `created the posting “${j.title}”`, link: `/recruiter/jobs/${j._id}/applicants` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 40);
  sendSuccess(res, { since, newApplications: newApps, events });
}));
