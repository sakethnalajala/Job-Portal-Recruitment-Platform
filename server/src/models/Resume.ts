import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A resume is its own document so an Application can freeze a reference to the
 * exact file the candidate applied with, even after they upload a new one.
 */
const resumeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publicId: { type: String, required: true }, // Cloudinary public_id (private/authenticated asset)
    originalName: { type: String, required: true, maxlength: 255 },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

resumeSchema.index({ user: 1, createdAt: -1 });

export type ResumeAttrs = InferSchemaType<typeof resumeSchema>;
export const Resume = model('Resume', resumeSchema);
