import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IUser extends Document {
  _id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away' | 'dnd';
  statusText?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  blockedUsers: string[];
  notificationPrefs: {
    global: {
      quietHoursStart?: string;
      quietHoursEnd?: string;
      emailDigest: 'off' | 'daily' | 'weekly';
    };
    rooms: Record<string, 'all' | 'mentions' | 'nothing'>;
  };
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    username: {
      type: String,
      required: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32,
      match: /^[a-z0-9_]+$/,
    },
    name: { type: String, required: true, minlength: 1, maxlength: 64 },
    email: { type: String, required: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: null },
    status: {
      type: String,
      enum: ['online', 'offline', 'away', 'dnd'],
      default: 'offline',
    },
    statusText: { type: String, maxlength: 100, default: null },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false, default: null },
    blockedUsers: [{ type: String }],
    notificationPrefs: {
      global: {
        quietHoursStart: { type: String, default: null },
        quietHoursEnd: { type: String, default: null },
        emailDigest: {
          type: String,
          enum: ['off', 'daily', 'weekly'],
          default: 'off',
        },
      },
      rooms: { type: Map, of: String, default: {} },
    },
    lastSeen: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    _id: false,
  }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ status: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
