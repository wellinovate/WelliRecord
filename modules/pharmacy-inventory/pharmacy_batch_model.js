import mongoose from "mongoose";

const { Schema } = mongoose;

// A batch is a specific lot of a product with its own expiry date,
// cost, and quantity. Nothing in this module should track inventory
// as a bare product-level number — see the shared architecture note
// in pharmacy_product_model.js.
//
// quantityOnHand is a cached read of "sum of ledger deltas for this
// batch" — every write to it goes through pharmacy_inventory_service.js
// inside the same transaction as the matching PharmacyStockLedger row,
// so the two never drift. The ledger, not this field, is the source of
// truth if the two ever need to be reconciled.
const pharmacyBatchSchema = new Schema(
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
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "PharmacySupplier",
      default: null,
      index: true,
    },
    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      ref: "PharmacyPurchaseOrder",
      default: null,
      index: true,
    },

    batchNumber: { type: String, required: true, trim: true, maxlength: 100 },

    // "central" for an independent pharmacy or a hospital's main
    // pharmacy store. A hospital ward/department layer can reuse this
    // same field (e.g. "ward:icu") once ward stock is built — that is
    // out of scope for this shared-core patch.
    location: { type: String, trim: true, maxlength: 100, default: "central" },

    quantityReceived: { type: Number, required: true, min: 0 },
    quantityOnHand: { type: Number, required: true, min: 0 },

    costPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },

    expiryDate: { type: Date, required: true, index: true },
    receivedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["active", "quarantined", "disposed", "returned", "depleted"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

pharmacyBatchSchema.index({ organizationId: 1, productId: 1, expiryDate: 1 });
pharmacyBatchSchema.index({ organizationId: 1, status: 1, expiryDate: 1 });
pharmacyBatchSchema.index(
  { organizationId: 1, productId: 1, batchNumber: 1, location: 1 },
  { unique: true },
);

export const pharmacyBatchModel = mongoose.model(
  "PharmacyBatch",
  pharmacyBatchSchema,
);
