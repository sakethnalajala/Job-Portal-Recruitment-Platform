import { Schema, model, type InferSchemaType } from 'mongoose';

const savedJobSchema = new Schema(
  {
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  },
  { timestamps: true },
);

savedJobSchema.index({ candidate: 1, job: 1 }, { unique: true });
savedJobSchema.index({ candidate: 1, createdAt: -1 });

export type SavedJobAttrs = InferSchemaType<typeof savedJobSchema>;
export const SavedJob = model('SavedJob', savedJobSchema);
