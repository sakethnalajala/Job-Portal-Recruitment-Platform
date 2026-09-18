import { Schema, model, type InferSchemaType } from 'mongoose';
import { NOTIFICATION_TYPES } from '../utils/constants';

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 150 },
    message: { type: String, required: true, maxlength: 1000 },
    link: { type: String, maxlength: 500 }, // client-side route, e.g. /candidate/applications/:id
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    meta: {
      jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
      applicationId: { type: Schema.Types.ObjectId, ref: 'Application' },
    },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
// Read notifications expire after 90 days; unread ones are kept.
notificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { isRead: true } },
);

export type NotificationAttrs = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);
