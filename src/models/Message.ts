import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name: string;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface IMention {
  _id: string;
  username: string;
  type: 'user' | 'here' | 'all';
}

export interface IReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IMessage extends Document {
  _id: string;
  rid: string;
  u: { _id: string; username: string };
  msg: string;
  type: 'text' | 'file' | 'poll' | 'system';
  attachments: IAttachment[];
  reactions: Record<string, IReaction>;
  mentions: IMention[];
  tmid?: string;
  tcount?: number;
  tlm?: Date;
  editedAt?: Date;
  editedBy?: { _id: string; username: string };
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: { _id: string; username: string };
  pinnedAt?: Date;
  pinnedBy?: { _id: string; username: string };
  ts: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    _id: { type: String, required: true },
    rid: { type: String, required: true },
    u: {
      _id: { type: String, required: true },
      username: { type: String, required: true },
    },
    msg: { type: String, default: '' },
    type: {
      type: String,
      enum: ['text', 'file', 'poll', 'system'],
      default: 'text',
    },
    attachments: [
      {
        id: String,
        name: String,
        mimeType: String,
        size: Number,
        url: String,
        thumbnailUrl: { type: String, default: null },
        width: { type: Number, default: null },
        height: { type: Number, default: null },
      },
    ],
    reactions: { type: Map, of: Schema.Types.Mixed, default: {} },
    mentions: [
      {
        _id: { type: String },
        username: { type: String },
        type: { type: String, enum: ['user', 'here', 'all'] },
      },
    ],
    tmid: { type: String, default: null },
    tcount: { type: Number, default: null },
    tlm: { type: Date, default: null },
    editedAt: { type: Date, default: null },
    editedBy: {
      _id: { type: String },
      username: { type: String },
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      _id: { type: String },
      username: { type: String },
    },
    pinnedAt: { type: Date, default: null },
    pinnedBy: {
      _id: { type: String },
      username: { type: String },
    },
    ts: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    _id: false,
  }
);

messageSchema.index({ rid: 1, ts: -1 });
messageSchema.index({ tmid: 1 });
messageSchema.index({ 'u._id': 1 });
messageSchema.index({ ts: 1 });
messageSchema.index({ msg: 'text' });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
