import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../utils/constants';

const BCRYPT_ROUNDS = 12;

export interface NotificationPreferences {
  email: { applicationUpdates: boolean; newApplicants: boolean; interviews: boolean; jobUpdates: boolean; marketing: boolean };
  inApp: { applicationUpdates: boolean; newApplicants: boolean; interviews: boolean; jobUpdates: boolean };
}

export interface UserAttrs {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  displayName?: string;
  notificationPreferences?: NotificationPreferences;
  isEmailVerified: boolean;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export interface UserModel extends Model<UserAttrs, object, UserMethods> {
  hashPassword(plain: string): Promise<string>;
}

export type UserDoc = HydratedDocument<UserAttrs, UserMethods>;

const SENSITIVE_FIELDS = [
  'passwordHash',
  'emailVerificationTokenHash',
  'emailVerificationExpiresAt',
  'passwordResetTokenHash',
  'passwordResetExpiresAt',
  '__v',
] as const;

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, immutable: true },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    displayName: { type: String, trim: true, maxlength: 120 },
    notificationPreferences: {
      email: {
        applicationUpdates: { type: Boolean, default: true },
        newApplicants: { type: Boolean, default: true },
        interviews: { type: Boolean, default: true },
        jobUpdates: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },
      inApp: {
        applicationUpdates: { type: Boolean, default: true },
        newApplicants: { type: Boolean, default: true },
        interviews: { type: Boolean, default: true },
        jobUpdates: { type: Boolean, default: true },
      },
    },

    isEmailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },

    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordChangedAt: { type: Date },

    lastLoginAt: { type: Date },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        for (const field of SENSITIVE_FIELDS) delete ret[field];
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

userSchema.methods.comparePassword = function (this: UserDoc, candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

export const User = model<UserAttrs, UserModel>('User', userSchema);
