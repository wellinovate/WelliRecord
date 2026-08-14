import mongoose from "mongoose";

const { Schema } = mongoose;

// Append-only stock movement log. Every change to quantityOnHand on a
// PharmacyBatch must create a ledger entry inside the same
// transaction.
//
// Do not edit or delete rows from this collection via service code — it
// is the audit trail that proves where every box of medicine came from
// and where it went.
const TRANSACTION_TYPES = [
  "opening",
  "purchase",
  "dispense",
  "sale",
  "transfer_out",
  "transfer_in",
  "adjustment",
  "return",
  "disposal",
];

const pharmacyStockLedgerSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "PharmacyProduct",
      required: true,
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "PharmacyBatch",
      required: true,
      index: true,
    },

    transactionType: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },

    // Positive for stock additions (purchases, transfers in, positive
    // adjustments), negative for stock reductions (dispenses, sales,
    // disposals, negative adjustments). Zero is invalid.
    quantityDelta: { type: Number, required: true },

    // The batch's quantityOnHand *after* applying this delta.
    balanceAfter: { type: Number, required: true, min: 0 },

    location: { type: String, trim: true, maxlength: 100, default: "central" },

    referenceType: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    referenceId: { type: Schema.Types.ObjectId, default: null },

    actorId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pharmacyStockLedgerSchema.index({ organizationId: 1, createdAt: -1 });
pharmacyStockLedgerSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
pharmacyStockLedgerSchema.index({ organizationId: 1, batchId: 1, createdAt: -1 });

export const pharmacyStockLedgerModel = mongoose.model(
  "PharmacyStockLedger",
  pharmacyStockLedgerSchema,
);
