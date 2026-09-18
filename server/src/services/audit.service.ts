import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../config/logger';
import type { AUDIT_ACTIONS } from '../utils/constants';

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

interface AuditInput {
  actor: string;
  action: AuditAction;
  targetType: 'user' | 'job' | 'report' | 'recruiterProfile' | 'settings';
  targetId: Types.ObjectId | string;
  reason?: string | undefined;
  metadata?: Record<string, unknown>;
  ip?: string | undefined;
}

/** Append-only record of privileged actions. Failure is logged, never thrown. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await AuditLog.create(input);
  } catch (err) {
    logger.error({ err, action: input.action }, '[audit] failed to write log');
  }
}
