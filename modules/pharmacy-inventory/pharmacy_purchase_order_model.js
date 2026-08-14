import mongoose from "mongoose";

const { Schema } = mongoose;

// Creating or editing a PO never changes inventory — only receiving
// goods against it does (see receiveGoodsService in
// pharmacy_inventory_service.js). That split is the point: it stops
// stock counts inflating the moment a PO is raised, before anything
// has actually arrived.
const STATUSES = [
  "draft",
  "pending_delivery",
  "partially_received",
  "received",
  "cancelled",
];

const poLineItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "PharmacyProduct",
      required: true,
    },
    quantityOrdered: { type: Number, required: true, min: 1 },
    quantityReceived: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const pharmacyPurchaseOrderSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "PharmacySupplier",
      required: true,
      index: true,
    },

    poNumber: { type: String, required: true, trim: true, maxlength: 50 },
    status: { type: String, enum: STATUSES, default: "draft", index: true },

    lineItems: {
      type: [poLineItemSchema],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A purchase order needs at least one line item",
      },
    },

    expectedDeliveryDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },

    createdBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { timestamps: true },
);

pharmacyPurchaseOrderSchema.index({ organizationId: 1, poNumber: 1 }, { unique: true });
pharmacyPurchaseOrderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const pharmacyPurchaseOrderModel = mongoose.model(
  "PharmacyPurchaseOrder",
  pharmacyPurchaseOrderSchema,
);
