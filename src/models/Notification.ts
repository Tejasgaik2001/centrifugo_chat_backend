import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface INotification extends Document {
  _id: string;
  userId: string;
  type: 'mention' | 'dm' | 'thread_reply' | 'invite' | 'system';
  roomId: string;
  messageId?: string;
  senderId?: string;
  preview: string;
  read: boolean;
  pushSent: boolean;
  emailSent: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    type: {
      type: String,
      enum: ['mention', 'dm', 'thread_reply', 'invite', 'system'],
      required: true,
    },
    roomId: { type: String, required: true },
    messageId: { type: String, default: null },
    senderId: { type: String, default: null },
    preview: { type: String, maxlength: 80, required: true },
    read: { type: Boolean, default: false },
    pushSent: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
