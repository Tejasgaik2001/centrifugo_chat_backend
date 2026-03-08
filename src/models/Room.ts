import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IRoom extends Document {
  _id: string;
  name?: string;
  type: 'd' | 'p' | 'c';
  description?: string;
  topic?: string;
  usernames: string[];
  memberIds: string[];
  moderatorIds: string[];
  pinnedMessages: string[];
  isEncrypted: boolean;
  isReadOnly: boolean;
  lastMessage?: {
    id: string;
    msg: string;
    ts: Date;
    u: { _id: string; username: string };
  };
  memberCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    _id: { type: String, required: true },
    name: { type: String, default: null },
    type: { type: String, enum: ['d', 'p', 'c'], required: true },
    description: { type: String, maxlength: 500, default: null },
    topic: { type: String, maxlength: 200, default: null },
    usernames: [{ type: String }],
    memberIds: [{ type: String }],
    moderatorIds: [{ type: String }],
    pinnedMessages: [{ type: String }],
    isEncrypted: { type: Boolean, default: false },
    isReadOnly: { type: Boolean, default: false },
    lastMessage: {
      id: String,
      msg: String,
      ts: Date,
      u: { _id: String, username: String },
    },
    memberCount: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
    _id: false,
  }
);

roomSchema.index({ type: 1 });
roomSchema.index({ usernames: 1 });
roomSchema.index({ memberIds: 1 });
roomSchema.index({ name: 'text' });

export const Room = mongoose.model<IRoom>('Room', roomSchema);
