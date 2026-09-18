import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Singleton document (key = 'default') holding admin-managed platform switches.
 * Nothing sensitive lives here — credentials stay in environment variables.
 */
const platformSettingsSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },
    platformName: { type: String, trim: true, maxlength: 60, default: 'TalentBridge' },
    supportEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    registration: {
      candidate: { type: Boolean, default: true },
      recruiter: { type: Boolean, default: true },
    },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: 300, default: 'We are performing scheduled maintenance. Please check back shortly.' },
    },
    announcement: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: 300 },
      tone: { type: String, enum: ['info', 'success', 'warning'], default: 'info' },
    },
    jobs: {
      requireVerifiedCompanyToPublish: { type: Boolean, default: false },
      defaultDeadlineDays: { type: Number, min: 1, max: 365, default: 30 },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type PlatformSettingsAttrs = InferSchemaType<typeof platformSettingsSchema>;
export const PlatformSettings = model('PlatformSettings', platformSettingsSchema);

/** Returns the singleton, creating it with defaults on first use. */
export async function getPlatformSettings() {
  return PlatformSettings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
}
