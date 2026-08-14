import mongoose from "mongoose";

const { Schema } = mongoose;

// Product master — one row per distinct medicine/product a facility
// stocks. This does NOT hold quantity; quantity lives on
// PharmacyBatch, because the same product can have several batches
// with different expiry dates and costs at once. See
// pharmacy_batch_model.js and pharmacy_stock_ledger_model.js for the
// rest of the shared inventory core.
const pharmacyProductSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
      index: true,
    },
    genericName: { type: String, trim: true, maxlength: 250, default: "" },
    brandName: { type: String, trim: true, maxlength: 250, default: "" },
    drugClass: { type: String, trim: true, maxlength: 150, default: "" },
    strength: { type: String, trim: true, maxlength: 100, default: "" },
    dosageForm: { type: String, trim: true, maxlength: 100, default: "" },
    packSize: { type: String, trim: true, maxlength: 100, default: "" },
    manufacturer: { type: String, trim: true, maxlength: 200, default: "" },
    countryOfManufacture: { type: String, trim: true, maxlength: 100, default: "" },
    nafdacNumber: { type: String, trim: true, maxlength: 100, default: "" },

    barcode: { type: String, trim: true, maxlength: 100, default: null },
    sku: { type: String, trim: true, maxlength: 100, default: null },

    category: { type: String, trim: true, maxlength: 100, default: "General" },

    // Whether this product is normally sold against a prescription or
    // over the counter. Doesn't gate dispensing by itself — that's
    // enforced wherever a sale/dispense is recorded — this is a
    // catalog-level default used for UI grouping and reporting.
    dispenseStatus: {
      type: String,
      enum: ["prescription", "otc"],
      default: "otc",
    },

    minimumStock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, default: 0, min: 0 },

    // Default selling price for new sales. A specific batch's
    // sellingPrice (pharmacy_batch_model.js) takes precedence when set
    // — this is only the fallback for a batch that didn't specify one.
    defaultSellingPrice: { type: Number, default: 0, min: 0 },
    storageRequirement: { type: String, trim: true, maxlength: 200, default: "" },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

pharmacyProductSchema.index({ organizationId: 1, name: 1 });
pharmacyProductSchema.index(
  { organizationId: 1, barcode: 1 },
  { unique: true, sparse: true },
);
pharmacyProductSchema.index(
  { organizationId: 1, sku: 1 },
  { unique: true, sparse: true },
);
pharmacyProductSchema.index({
  name: "text",
  genericName: "text",
  brandName: "text",
});

export const pharmacyProductModel = mongoose.model(
  "PharmacyProduct",
  pharmacyProductSchema,
);
