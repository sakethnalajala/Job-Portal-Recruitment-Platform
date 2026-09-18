import { Schema, model, type InferSchemaType } from 'mongoose';

const locationSchema = new Schema(
  {
    city: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const educationSchema = new Schema({
  institution: { type: String, required: true, trim: true, maxlength: 200 },
  degree: { type: String, required: true, trim: true, maxlength: 120 },
  field: { type: String, trim: true, maxlength: 120 },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  current: { type: Boolean, default: false },
  grade: { type: String, trim: true, maxlength: 50 },
});

const experienceSchema = new Schema({
  company: { type: String, required: true, trim: true, maxlength: 200 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  current: { type: Boolean, default: false },
  description: { type: String, trim: true, maxlength: 2000 },
});

const certificationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  issuer: { type: String, trim: true, maxlength: 200 },
  issueDate: { type: Date },
  credentialUrl: { type: String, trim: true, maxlength: 500 },
});

const candidateProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    headline: { type: String, trim: true, maxlength: 150 },
    bio: { type: String, trim: true, maxlength: 2000 },
    location: { type: locationSchema, default: () => ({}) },
    photoPublicId: { type: String },
    skills: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 50 }],
      default: [],
      validate: [(v: string[]) => v.length <= 50, 'Maximum 50 skills'],
    },
    education: { type: [educationSchema], default: [], validate: [(v: unknown[]) => v.length <= 20, 'Max 20'] },
    experience: { type: [experienceSchema], default: [], validate: [(v: unknown[]) => v.length <= 20, 'Max 20'] },
    certifications: { type: [certificationSchema], default: [], validate: [(v: unknown[]) => v.length <= 20, 'Max 20'] },
    totalExperienceYears: { type: Number, min: 0, max: 60 },
    preferredWorkTypes: { type: [String], default: [] },
    portfolioUrl: { type: String, trim: true, maxlength: 500 },
    linkedinUrl: { type: String, trim: true, maxlength: 500 },
    githubUrl: { type: String, trim: true, maxlength: 500 },
    activeResume: { type: Schema.Types.ObjectId, ref: 'Resume' },
    completion: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true },
);

candidateProfileSchema.index({ skills: 1 });
candidateProfileSchema.index({ 'location.city': 1 });

/** Profile completion is derived so the UI can show a progress indicator. */
candidateProfileSchema.pre('save', function (next) {
  const checks: boolean[] = [
    Boolean(this.fullName),
    Boolean(this.phone),
    Boolean(this.headline),
    Boolean(this.bio && this.bio.length >= 50),
    Boolean(this.location?.city),
    Boolean(this.photoPublicId),
    this.skills.length >= 3,
    this.education.length > 0,
    this.experience.length > 0,
    Boolean(this.activeResume),
    Boolean(this.linkedinUrl || this.githubUrl || this.portfolioUrl),
  ];
  const done = checks.filter(Boolean).length;
  this.completion = Math.round((done / checks.length) * 100);
  next();
});

export type CandidateProfileAttrs = InferSchemaType<typeof candidateProfileSchema>;
export const CandidateProfile = model('CandidateProfile', candidateProfileSchema);
