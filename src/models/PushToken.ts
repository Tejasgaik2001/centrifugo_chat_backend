import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IPushToken extends Document {
  _id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  createdAt: Date;
  lastUsedAt: Date;
}

const pushTokenSchema = new Schema<IPushToken>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    appVersion: { type: String },
    lastUsedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

pushTokenSchema.index({ userId: 1 });
pushTokenSchema.index({ token: 1 }, { unique: true });

export const PushToken = mongoose.model<IPushToken>('PushToken', pushTokenSchema);
