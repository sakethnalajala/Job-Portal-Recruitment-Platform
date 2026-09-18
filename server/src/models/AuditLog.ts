import { Schema, model, type InferSchemaType } from 'mongoose';
import { AUDIT_ACTIONS } from '../utils/constants';

/** Immutable record of privileged (admin) actions. */
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    targetType: { type: String, enum: ['user', 'job', 'report', 'recruiterProfile', 'settings'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, maxlength: 1000 },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

export type AuditLogAttrs = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
