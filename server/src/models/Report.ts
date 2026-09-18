import { Schema, model, type InferSchemaType } from 'mongoose';
import { REPORT_REASONS, REPORT_STATUSES } from '../utils/constants';

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['job', 'user'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: 'pending' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });
// A user can report the same target only once.
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });

export type ReportAttrs = InferSchemaType<typeof reportSchema>;
export const Report = model('Report', reportSchema);
