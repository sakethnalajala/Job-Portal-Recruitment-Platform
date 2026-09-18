import { Schema, model, type InferSchemaType } from 'mongoose';
import { APPLICATION_STATUSES, INTERVIEW_MODES } from '../utils/constants';

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    question: { type: String, required: true, maxlength: 300 }, // snapshot
    answer: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, maxlength: 1000 },
  },
  { _id: false },
);

const interviewSchema = new Schema(
  {
    scheduledAt: { type: Date },
    mode: { type: String, enum: INTERVIEW_MODES },
    location: { type: String, maxlength: 300 },
    meetingLink: { type: String, maxlength: 500 },
    notes: { type: String, maxlength: 2000 },
    durationMinutes: { type: Number, min: 5, max: 480 },
  },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // denormalized for pipeline queries
    resume: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },
    coverLetter: { type: String, trim: true, maxlength: 5000 },
    answers: { type: [answerSchema], default: [] },

    status: { type: String, enum: APPLICATION_STATUSES, default: 'applied' },
    statusHistory: { type: [statusHistorySchema], default: [] },
    interview: { type: interviewSchema },

    // Only ever returned to the recruiter who owns the job / admin.
    recruiterNotes: { type: String, maxlength: 3000 },
    rating: { type: Number, min: 1, max: 5 },

    withdrawnAt: { type: Date },
  },
  { timestamps: true },
);

// Enforces "one application per candidate per job" at the database level.
applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
applicationSchema.index({ candidate: 1, createdAt: -1 });
applicationSchema.index({ job: 1, status: 1, createdAt: -1 });
applicationSchema.index({ recruiter: 1, status: 1, createdAt: -1 });

export type ApplicationAttrs = InferSchemaType<typeof applicationSchema>;
export const Application = model('Application', applicationSchema);
