import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IBookmark extends Document {
  _id: string;
  userId: string;
  messageId: string;
  rid: string;
  createdAt: Date;
}

const bookmarkSchema = new Schema<IBookmark>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    messageId: { type: String, required: true },
    rid: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

bookmarkSchema.index({ userId: 1, createdAt: -1 });
bookmarkSchema.index({ userId: 1, messageId: 1 }, { unique: true });

export const Bookmark = mongoose.model<IBookmark>('Bookmark', bookmarkSchema);
