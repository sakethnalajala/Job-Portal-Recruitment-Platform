import { Schema, model, type InferSchemaType } from 'mongoose';

export const TEAM_ROLES = ['admin', 'recruiter', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/**
 * A company's hiring team. `owner` is the recruiter account that owns the jobs.
 * When the invited email belongs to an existing recruiter account, `user` is
 * linked and that person gains role-based access to the owner's postings:
 *   admin     – edit jobs, change stages, manage the team
 *   recruiter – review applicants and change stages
 *   viewer    – read-only
 */
const teamMemberSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, trim: true, maxlength: 120 },
    title: { type: String, trim: true, maxlength: 120 },
    role: { type: String, enum: TEAM_ROLES, default: 'recruiter' },
    status: { type: String, enum: ['invited', 'active', 'removed'], default: 'invited' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
  },
  { timestamps: true },
);

teamMemberSchema.index({ owner: 1, email: 1 }, { unique: true });
teamMemberSchema.index({ user: 1, status: 1 });

export type TeamMemberAttrs = InferSchemaType<typeof teamMemberSchema>;
export const TeamMember = model('TeamMember', teamMemberSchema);
