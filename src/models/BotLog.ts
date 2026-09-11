import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBotLog extends Document {
  phone?: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  messageBody?: string;
  rawPayload?: string;
  status: string;
  statusCode?: number | string;
  errorMessage?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  sentimentScore?: number;
  sentimentReason?: string;
  isUrgentComplaint?: boolean;
  createdAt: Date;
}

const BotLogSchema: Schema<IBotLog> = new Schema(
  {
    phone: { type: String, index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
    messageType: { type: String, default: 'text' },
    messageBody: { type: String, default: '' },
    rawPayload: { type: String, default: '' },
    status: { type: String, default: 'success', index: true },
    statusCode: { type: Schema.Types.Mixed, default: 200 },
    errorMessage: { type: String, default: '' },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], index: true },
    sentimentScore: { type: Number },
    sentimentReason: { type: String },
    isUrgentComplaint: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const BotLog: Model<IBotLog> =
  mongoose.models.BotLog || mongoose.model<IBotLog>('BotLog', BotLogSchema);

export default BotLog;
