import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMenu extends Document {
  categoryId: mongoose.Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MenuSchema: Schema<IMenu> = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export const Menu: Model<IMenu> =
  mongoose.models.Menu || mongoose.model<IMenu>('Menu', MenuSchema);

export default Menu;
