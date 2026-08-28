import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBotConfig extends Document {
  configKey: string;
  configValue: string;
  updatedAt: Date;
}

const BotConfigSchema: Schema<IBotConfig> = new Schema(
  {
    configKey: { type: String, required: true, unique: true, index: true },
    configValue: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

export const BotConfig: Model<IBotConfig> =
  mongoose.models.BotConfig || mongoose.model<IBotConfig>('BotConfig', BotConfigSchema);

export default BotConfig;
