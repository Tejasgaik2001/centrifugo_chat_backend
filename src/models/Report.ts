import mongoose, { Schema, Document } from 'mongoose';

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IReport extends Document {
  _id: string;
  reporterId: string;
  targetType: 'message' | 'user';
  targetId: string;
  reason: 'spam' | 'harassment' | 'inappropriate' | 'other';
  description?: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    _id: { type: String, required: true },
    reporterId: { type: String, required: true },
    targetType: { type: String, enum: ['message', 'user'], required: true },
    targetId: { type: String, required: true },
    reason: {
      type: String,
      enum: ['spam', 'harassment', 'inappropriate', 'other'],
      required: true,
    },
    description: { type: String, maxlength: 500, default: null },
    status: {
      type: String,
      enum: ['open', 'resolved', 'dismissed'],
      default: 'open',
    },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1 });

export const Report = mongoose.model<IReport>('Report', reportSchema);
