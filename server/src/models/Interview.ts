import { Schema, model, type InferSchemaType } from 'mongoose';
import { INTERVIEW_MODES } from '../utils/constants';

export const INTERVIEW_STATUSES = ['scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const INTERVIEW_OUTCOMES = ['pending', 'advance', 'hold', 'reject'] as const;

/**
 * One row per interview round. The latest active round is mirrored onto
 * Application.interview so candidate-facing views keep working unchanged.
 */
const interviewSchema = new Schema(
  {
    application: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // job owner (scope key)
    scheduledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    round: { type: Number, min: 1, default: 1 },
    title: { type: String, trim: true, maxlength: 120, default: 'Interview' },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, min: 5, max: 480, default: 60 },
    mode: { type: String, enum: INTERVIEW_MODES, required: true },
    location: { type: String, trim: true, maxlength: 300 },
    meetingLink: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 2000 }, // shared with candidate
    status: { type: String, enum: INTERVIEW_STATUSES, default: 'scheduled' },
    outcome: { type: String, enum: INTERVIEW_OUTCOMES, default: 'pending' },
    feedback: { type: String, trim: true, maxlength: 3000 }, // recruiter-only
    reminderSentAt: { type: Date },
    cancelledReason: { type: String, trim: true, maxlength: 500 },
    history: [{ action: { type: String, maxlength: 40 }, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: 'User' }, note: { type: String, maxlength: 500 } }],
  },
  { timestamps: true },
);

interviewSchema.index({ recruiter: 1, scheduledAt: 1 });
interviewSchema.index({ recruiter: 1, status: 1, scheduledAt: 1 });
interviewSchema.index({ application: 1, createdAt: -1 });
interviewSchema.index({ candidate: 1, scheduledAt: -1 });
interviewSchema.index({ status: 1, scheduledAt: 1, reminderSentAt: 1 });

export type InterviewAttrs = InferSchemaType<typeof interviewSchema>;
export const Interview = model('Interview', interviewSchema);
