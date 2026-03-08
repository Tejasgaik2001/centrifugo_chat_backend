import mongoose, { Schema, Document } from 'mongoose';

export interface IPollOption {
  id: string;
  text: string;
  votes: number;
  voters: string[];
}

// @ts-expect-error - Using custom string _id instead of ObjectId
export interface IPoll extends Document {
  _id: string;
  rid: string;
  messageId: string;
  createdBy: string;
  question: string;
  options: IPollOption[];
  multiChoice: boolean;
  closed: boolean;
  closedAt?: Date;
  totalVotes: number;
  createdAt: Date;
}

const pollSchema = new Schema<IPoll>(
  {
    _id: { type: String, required: true },
    rid: { type: String, required: true },
    messageId: { type: String, required: true },
    createdBy: { type: String, required: true },
    question: { type: String, required: true, maxlength: 300 },
    options: [
      {
        id: { type: String, required: true },
        text: { type: String, required: true, maxlength: 100 },
        voterIds: [{ type: String }],
        count: { type: Number, default: 0 },
      },
    ],
    multiChoice: { type: Boolean, default: false },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    totalVotes: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

export const Poll = mongoose.model<IPoll>('Poll', pollSchema);
