import mongoose from "mongoose";

const { Schema } = mongoose;

// Phase 1 is manual settlement only: a provider records that cash, POS,
// or a bank transfer was received at the desk. There is no payment
// gateway wired up (no Paystack/Flutterwave/Stripe integration exists
// in this codebase) — "recordPayment" does not move any money, it
// documents money that already changed hands elsewhere.
const paymentSchema = new Schema(
  {
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },

    amount: { type: Number, required: true, min: 0.01 },

    method: {
      type: String,
      enum: ["cash", "pos", "bank-transfer", "other"],
      required: true,
    },

    reference: { type: String, trim: true, maxlength: 200, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

paymentSchema.index({ invoiceId: 1, paidAt: -1 });

export const paymentModel = mongoose.model("Payment", paymentSchema);
