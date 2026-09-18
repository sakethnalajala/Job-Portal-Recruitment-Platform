import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  QUESTION_TYPES,
  SALARY_PERIODS,
  WORK_TYPES,
} from '../utils/constants';

const customQuestionSchema = new Schema({
  question: { type: String, required: true, trim: true, maxlength: 300 },
  type: { type: String, enum: QUESTION_TYPES, default: 'text' },
  options: { type: [{ type: String, trim: true, maxlength: 100 }], default: [] },
  required: { type: Boolean, default: true },
});

const jobSchema = new Schema(
  {
    recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recruiterProfile: { type: Schema.Types.ObjectId, ref: 'RecruiterProfile', required: true },

    // Denormalized snapshot for list rendering + text search (refreshed on profile update)
    companyName: { type: String, required: true, trim: true, maxlength: 150 },
    companyLogoPublicId: { type: String },
    companyVerified: { type: Boolean, default: false },

    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    responsibilities: { type: [{ type: String, trim: true, maxlength: 500 }], default: [] },
    requiredSkills: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 50 }],
      default: [],
    },
    preferredSkills: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 50 }],
      default: [],
    },
    location: {
      city: { type: String, trim: true, maxlength: 100 },
      country: { type: String, trim: true, maxlength: 100 },
    },
    workType: { type: String, enum: WORK_TYPES, required: true },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    salary: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, default: 'INR', maxlength: 3 },
      period: { type: String, enum: SALARY_PERIODS, default: 'year' },
      isVisible: { type: Boolean, default: true },
    },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, required: true },
    experienceYears: {
      min: { type: Number, min: 0, max: 60 },
      max: { type: Number, min: 0, max: 60 },
    },
    educationRequirement: { type: String, trim: true, maxlength: 300 },
    benefits: { type: [{ type: String, trim: true, maxlength: 200 }], default: [] },
    openings: { type: Number, min: 1, default: 1 },
    deadline: { type: Date },

    status: { type: String, enum: JOB_STATUSES, default: 'draft' },
    publishedAt: { type: Date },
    closedAt: { type: Date },

    customQuestions: {
      type: [customQuestionSchema],
      default: [],
      validate: [(v: unknown[]) => v.length <= 10, 'Maximum 10 custom questions'],
    },

    applicationCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },

    moderation: {
      removedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      removedAt: { type: Date },
      reason: { type: String, maxlength: 500 },
    },
  },
  { timestamps: true },
);

// Keyword search across the fields candidates actually search by.
jobSchema.index(
  {
    title: 'text',
    requiredSkills: 'text',
    preferredSkills: 'text',
    companyName: 'text',
    description: 'text',
  },
  {
    name: 'job_text_search',
    weights: { title: 10, requiredSkills: 6, companyName: 5, preferredSkills: 3, description: 1 },
  },
);
jobSchema.index({ status: 1, publishedAt: -1 });
jobSchema.index({ status: 1, workType: 1, employmentType: 1, experienceLevel: 1 });
jobSchema.index({ status: 1, 'location.city': 1 });
jobSchema.index({ status: 1, requiredSkills: 1 });
jobSchema.index({ status: 1, 'salary.min': 1, 'salary.max': 1 });
jobSchema.index({ recruiter: 1, status: 1, createdAt: -1 });
jobSchema.index({ deadline: 1 });

/** Derived: an open job whose deadline has passed no longer accepts applications. */
jobSchema.virtual('isExpired').get(function () {
  return Boolean(this.deadline && this.deadline.getTime() < Date.now());
});

jobSchema.set('toJSON', { virtuals: true });
jobSchema.set('toObject', { virtuals: true });

export type JobAttrs = InferSchemaType<typeof jobSchema>;
export const Job = model('Job', jobSchema);
