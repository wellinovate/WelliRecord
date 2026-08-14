import mongoose from "mongoose";

const { Schema } = mongoose;

const pharmacySupplierSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true, maxlength: 200 },
    contactName: { type: String, trim: true, maxlength: 200, default: "" },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    email: { type: String, trim: true, maxlength: 200, default: "" },
    address: { type: String, trim: true, maxlength: 300, default: "" },

    paymentTerms: { type: String, trim: true, maxlength: 200, default: "" },
    creditLimit: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

pharmacySupplierSchema.index({ organizationId: 1, name: 1 });

export const pharmacySupplierModel = mongoose.model(
  "PharmacySupplier",
  pharmacySupplierSchema,
);
