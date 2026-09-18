import { Schema, model, type InferSchemaType } from 'mongoose';

const recruiterProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    companyName: { type: String, required: true, trim: true, maxlength: 150 },
    companyDescription: { type: String, trim: true, maxlength: 3000 },
    logoPublicId: { type: String },
    photoPublicId: { type: String }, // recruiter's own photo (company logo is separate)
    industry: { type: String, trim: true, maxlength: 100 },
    website: { type: String, trim: true, maxlength: 500 },
    companySize: { type: String, trim: true, maxlength: 50 },
    location: {
      city: { type: String, trim: true, maxlength: 100 },
      country: { type: String, trim: true, maxlength: 100 },
    },
    phone: { type: String, trim: true, maxlength: 20 },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

recruiterProfileSchema.index({ companyName: 1 });
recruiterProfileSchema.index({ isVerified: 1 });

export type RecruiterProfileAttrs = InferSchemaType<typeof recruiterProfileSchema>;
export const RecruiterProfile = model('RecruiterProfile', recruiterProfileSchema);
