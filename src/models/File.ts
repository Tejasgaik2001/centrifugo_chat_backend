import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IFile extends Document {
  _id: string;
  name: string;
  userId: string;
  rid: string;
  messageId: string;
  mimeType: string;
  size: number;
  extension: string;
  storageKey: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  createdAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    userId: { type: String, required: true },
    rid: { type: String, required: true },
    messageId: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    extension: { type: String, required: true },
    storageKey: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    thumbnailUrl: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

fileSchema.index({ rid: 1 });
fileSchema.index({ userId: 1 });
fileSchema.index({ storageKey: 1 }, { unique: true });

export const File = mongoose.model<IFile>('File', fileSchema);
