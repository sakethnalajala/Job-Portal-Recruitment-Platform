import type { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { logger } from '../config/logger';
import type { NOTIFICATION_TYPES } from '../utils/constants';

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  meta?: { jobId?: Types.ObjectId | string; applicationId?: Types.ObjectId | string };
}

/** Which preference switch governs each notification type (undefined = always delivered). */
const PREF_KEY: Partial<Record<NotificationType, 'applicationUpdates' | 'newApplicants' | 'interviews' | 'jobUpdates'>> = {
  application_status: 'applicationUpdates',
  application_submitted: 'applicationUpdates',
  application_withdrawn: 'applicationUpdates',
  new_applicant: 'newApplicants',
  interview_scheduled: 'interviews',
  job_closed: 'jobUpdates',
};

export async function wantsNotification(userId: Types.ObjectId | string, type: NotificationType, channel: 'inApp' | 'email'): Promise<boolean> {
  const key = PREF_KEY[type];
  if (!key) return true;
  const user = await User.findById(userId).select('notificationPreferences').lean();
  const prefs = user?.notificationPreferences?.[channel] as Record<string, boolean> | undefined;
  return prefs?.[key] ?? true;
}

/** In-app notification. Never throws — a notification failure must not fail the request. */
export async function notify(userId: Types.ObjectId | string, input: NotificationInput): Promise<void> {
  try {
    if (!(await wantsNotification(userId, input.type, 'inApp'))) return;
    await Notification.create({ user: userId, ...input });
  } catch (err) {
    logger.error({ err, userId, type: input.type }, '[notification] failed to create');
  }
}

export async function notifyMany(
  userIds: Array<Types.ObjectId | string>,
  input: NotificationInput,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await Notification.insertMany(userIds.map((user) => ({ user, ...input })), { ordered: false });
  } catch (err) {
    logger.error({ err, count: userIds.length, type: input.type }, '[notification] bulk create failed');
  }
}
