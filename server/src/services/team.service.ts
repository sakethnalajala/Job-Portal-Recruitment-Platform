import { Types } from 'mongoose';
import { TeamMember, type TeamRole } from '../models/TeamMember';
import { AppError } from '../utils/AppError';

export interface RecruiterScope {
  /** Owner ids whose jobs this user may see: themselves + owners of teams they belong to. */
  ownerIds: Types.ObjectId[];
  /** Role per owner id (own account = 'owner'). */
  roles: Map<string, TeamRole | 'owner'>;
}

/** Resolves which recruiter accounts' data the user can access, and with what role. */
export async function getRecruiterScope(userId: string): Promise<RecruiterScope> {
  const self = new Types.ObjectId(userId);
  const roles = new Map<string, TeamRole | 'owner'>([[userId, 'owner']]);
  const memberships = await TeamMember.find({ user: self, status: 'active' }).select('owner role').lean();
  for (const m of memberships) roles.set(m.owner.toString(), m.role as TeamRole);
  return { ownerIds: [self, ...memberships.map((m) => m.owner)], roles };
}

const CAN = {
  view: new Set<TeamRole | 'owner'>(['owner', 'admin', 'recruiter', 'viewer']),
  review: new Set<TeamRole | 'owner'>(['owner', 'admin', 'recruiter']), // change stages, notes, interviews
  manageJobs: new Set<TeamRole | 'owner'>(['owner', 'admin']), // edit/publish/close/delete
} as const;

export type Capability = keyof typeof CAN;

/** Throws 403 unless `userId` holds `capability` over data owned by `ownerId`. */
export async function assertScope(userId: string, ownerId: Types.ObjectId | string, capability: Capability): Promise<RecruiterScope> {
  const scope = await getRecruiterScope(userId);
  const role = scope.roles.get(ownerId.toString());
  if (!role || !CAN[capability].has(role)) {
    throw AppError.forbidden(
      capability === 'view'
        ? 'You do not have access to this job posting'
        : capability === 'review'
          ? 'Viewers cannot change applications — ask the account owner for the recruiter role'
          : 'Only the account owner or a team admin can manage job postings',
      'TEAM_SCOPE',
    );
  }
  return scope;
}

/** Links pending invitations for a recruiter email to their account (called on login/register). */
export async function activatePendingInvitations(userId: string, email: string): Promise<number> {
  const result = await TeamMember.updateMany(
    { email: email.toLowerCase(), status: 'invited' },
    { $set: { user: new Types.ObjectId(userId), status: 'active', joinedAt: new Date() } },
  );
  return result.modifiedCount;
}
