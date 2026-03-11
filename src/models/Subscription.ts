import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface ISubscription extends Document {
  _id: string;
  roomId: string;
  u: { _id: string; username: string };
  name: string;
  unread: number;
  userMentions: number;
  ls?: Date;
  f: boolean;
  open: boolean;
  notificationPref: 'default' | 'all' | 'mentions' | 'nothing';
  createdAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    _id: { type: String, required: true },
    roomId: { type: String, required: true },
    u: {
      _id: { type: String, required: true },
      username: { type: String, required: true },
    },
    name: { type: String, required: true },
    unread: { type: Number, default: 0 },
    userMentions: { type: Number, default: 0 },
    ls: { type: Date, default: null },
    f: { type: Boolean, default: false },
    open: { type: Boolean, default: true },
    notificationPref: {
      type: String,
      enum: ['default', 'all', 'mentions', 'nothing'],
      default: 'default',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

subscriptionSchema.index({ 'u._id': 1, roomId: 1 }, { unique: true });
subscriptionSchema.index({ roomId: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
