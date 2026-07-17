import { model, Schema } from "mongoose";

export interface Product {
  name: string;
  price: number;
  productNo: number;
}

const productSchema = new Schema<Product>(
  {
    name: {
      required: true,
      trim: true,
      type: String,
    },
    price: {
      min: 0,
      required: true,
      type: Number,
    },
    productNo: {
      min: 1,
      required: true,
      type: Number,
      unique: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

productSchema.index({ name: "text" });
productSchema.index({ productNo: 1, price: 1 });

const ProductModel = model<Product>("Product", productSchema);

export default ProductModel;