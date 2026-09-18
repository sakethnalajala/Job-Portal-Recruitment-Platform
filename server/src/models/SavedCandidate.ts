import { Schema, model, type InferSchemaType } from 'mongoose';

/** A recruiter's talent pool entry. Only candidates who applied to the recruiter's jobs can be saved. */
const savedCandidateSchema = new Schema(
  {
    recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, trim: true, lowercase: true, maxlength: 40, default: 'general' },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }], default: [], validate: [(v: string[]) => v.length <= 15, 'Max 15 tags'] },
    notes: { type: String, trim: true, maxlength: 3000 },
    rating: { type: Number, min: 1, max: 5 },
    sourceApplication: { type: Schema.Types.ObjectId, ref: 'Application' },
  },
  { timestamps: true },
);

savedCandidateSchema.index({ recruiter: 1, candidate: 1 }, { unique: true });
savedCandidateSchema.index({ recruiter: 1, category: 1, updatedAt: -1 });

export type SavedCandidateAttrs = InferSchemaType<typeof savedCandidateSchema>;
export const SavedCandidate = model('SavedCandidate', savedCandidateSchema);
