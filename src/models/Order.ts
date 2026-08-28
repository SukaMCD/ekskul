import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrderItem {
  menuId?: mongoose.Types.ObjectId;
  menuCode: string;
  menuName: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string;
}

export interface IOrder extends Document {
  invoiceNo: string;
  customerPhone: string;
  customerName: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  deliveryAddress?: string;
  notes?: string;
  totalItems: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: 'unpaid' | 'paid' | 'verified';
  orderStatus: 'pending' | 'confirmed' | 'cooking' | 'ready' | 'delivered' | 'cancelled';
  proofImage?: string;
  items: IOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    menuId: { type: Schema.Types.ObjectId, ref: 'Menu' },
    menuCode: { type: String, required: true },
    menuName: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const OrderSchema: Schema<IOrder> = new Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, index: true },
    customerPhone: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    orderType: {
      type: String,
      enum: ['dine_in', 'takeaway', 'delivery'],
      default: 'delivery',
    },
    deliveryAddress: { type: String, default: '' },
    notes: { type: String, default: '' },
    totalItems: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'Transfer Bank / QRIS' },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'verified'],
      default: 'unpaid',
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'cooking', 'ready', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    proofImage: { type: String, default: '' },
    items: [OrderItemSchema],
  },
  {
    timestamps: true,
  }
);

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
