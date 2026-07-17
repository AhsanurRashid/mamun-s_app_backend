import { model, Schema } from "mongoose";

export interface Customer {
  address?: string;
  name: string;
  phone: string;
}

const customerSchema = new Schema<Customer>(
  {
    address: {
      trim: true,
      type: String,
    },
    name: {
      required: true,
      trim: true,
      type: String,
    },
    phone: {
      required: true,
      trim: true,
      type: String,
      unique: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

customerSchema.index({ name: "text", phone: "text" });

const CustomerModel = model<Customer>("Customer", customerSchema);

export default CustomerModel;
