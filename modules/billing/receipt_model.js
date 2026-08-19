import mongoose from "mongoose";

const { Schema } = mongoose;

// A receipt is proof that money was received — distinct from an
// invoice, which is a bill for money owed. Auto-created every time
// recordPaymentService runs; never created directly by a route.
const receiptSchema = new Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },

    invoiceNumber: { type: String, required: true },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true },

    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const receiptModel = mongoose.model("Receipt", receiptSchema);
