import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const LINE_ITEM_CATEGORIES = [
  "consultation",
  "laboratory",
  "radiology",
  "procedure",
  "pharmacy",
  "consumable",
  "other",
];

// Each line item can optionally point back at the record it was pulled
// from (a lab order, a pharmacy order, a radiology order) so the
// invoice stays traceable to the clinical event that generated the
// charge. sourceId is intentionally untyped (no `ref`) since it can
// point at three different collections depending on sourceType —
// resolved manually in the service layer when needed, not via
// populate().
const invoiceLineItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 250 },
    category: { type: String, enum: LINE_ITEM_CATEGORIES, default: "other" },
    sourceType: {
      type: String,
      enum: ["lab_order", "pharmacy_order", "radiology_order", "manual"],
      default: "manual",
    },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const invoiceSchema = new Schema(
  {
    ...clinicalMetadataFields,

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Separate from invoiceNumber on purpose. invoiceNumber is
    // sequential (WR-INV-2026-000001, ...002, ...) so it's guessable —
    // fine for an internal record label, not safe as the lookup key
    // for the public, unauthenticated QR-code verification endpoint.
    // A random token means scanning through sequential numbers can't
    // be used to enumerate other patients' invoices.
    verificationToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    lineItems: {
      type: [invoiceLineItemSchema],
      default: [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "An invoice needs at least one line item",
      },
    },

    subtotal: { type: Number, required: true, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },

    // HMO contribution is entered manually by the provider — HMO Connect
    // (live payer lookup/adjudication) isn't built yet, so this is not
    // computed from any real coverage check. See patientResponsibility.
    hmoContribution: { type: Number, default: 0, min: 0 },

    // subtotal - discountTotal + taxTotal - hmoContribution, floored at 0
    patientResponsibility: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    amountPaid: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["unpaid", "partially-paid", "paid", "void"],
      default: "unpaid",
      index: true,
    },

    dueDate: { type: Date, default: null },

    voidedAt: { type: Date, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    voidReason: { type: String, trim: true, maxlength: 500, default: null },

    lastSentAt: { type: Date, default: null },
    lastReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

invoiceSchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["provider"],
  defaultSource: "provider",
  defaultCreatedContext: "facility-chart",
  providerOwnedSources: ["provider"],
});

invoiceSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ patientId: 1, status: 1, createdAt: -1 });

export const LINE_ITEM_CATEGORY_LIST = LINE_ITEM_CATEGORIES;
export const invoiceModel = mongoose.model("Invoice", invoiceSchema);
