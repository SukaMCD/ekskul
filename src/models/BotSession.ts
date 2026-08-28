import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBotSession extends Document {
  phone: string;
  state: string;
  tempData: Record<string, any>;
  isPaused: boolean;
  pausedAt?: Date;
  lastInteraction: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BotSessionSchema: Schema<IBotSession> = new Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    state: { type: String, default: 'IDLE' },
    tempData: { type: Schema.Types.Mixed, default: {} },
    isPaused: { type: Boolean, default: false, index: true },
    pausedAt: { type: Date, default: null },
    lastInteraction: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const BotSession: Model<IBotSession> =
  mongoose.models.BotSession || mongoose.model<IBotSession>('BotSession', BotSessionSchema);

export default BotSession;
