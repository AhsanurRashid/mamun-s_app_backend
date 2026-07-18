import { model, Schema, type Types } from "mongoose";

export interface SaleItem {
  discountPercent: number;
  lineTotal: number;
  product: Types.ObjectId;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Sale {
  customer: Types.ObjectId;
  customerName: string;
  dueAmount: number;
  extraDiscount: number;
  grandTotal: number;
  items: SaleItem[];
  note?: string;
  paidAmount: number;
  subtotal: number;
  totalDiscount: number;
}

const saleItemSchema = new Schema<SaleItem>(
  {
    discountPercent: {
      default: 0,
      max: 100,
      min: 0,
      required: true,
      type: Number,
    },
    lineTotal: {
      min: 0,
      required: true,
      type: Number,
    },
    product: {
      ref: "Product",
      required: true,
      type: Schema.Types.ObjectId,
    },
    productName: {
      required: true,
      trim: true,
      type: String,
    },
    quantity: {
      min: 1,
      required: true,
      type: Number,
    },
    unitPrice: {
      min: 0,
      required: true,
      type: Number,
    },
  },
  {
    _id: false,
    id: false,
  },
);

const saleSchema = new Schema<Sale>(
  {
    customer: {
      ref: "Customer",
      required: true,
      type: Schema.Types.ObjectId,
    },
    customerName: {
      required: true,
      trim: true,
      type: String,
    },
    grandTotal: {
      min: 0,
      required: true,
      type: Number,
    },
    items: {
      required: true,
      type: [saleItemSchema],
      validate: {
        message: "At least one sale item is required.",
        validator: (value: SaleItem[]) => Array.isArray(value) && value.length > 0,
      },
    },
    dueAmount: {
      default: 0,
      min: 0,
      required: true,
      type: Number,
    },
    extraDiscount: {
      default: 0,
      min: 0,
      required: true,
      type: Number,
    },
    paidAmount: {
      default: 0,
      min: 0,
      required: true,
      type: Number,
    },
    note: {
      trim: true,
      type: String,
    },
    subtotal: {
      min: 0,
      required: true,
      type: Number,
    },
    totalDiscount: {
      min: 0,
      required: true,
      type: Number,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

saleSchema.index({ customer: 1, createdAt: -1 });
saleSchema.index({ customerName: "text", "items.productName": "text" });

const SaleModel = model<Sale>("Sale", saleSchema);

export default SaleModel;
