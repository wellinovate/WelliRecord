import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const WORKFLOW_STAGES = [
  "prescribed",
  "verified",
  "dispensing",
  "dispensed",
  "picked-up",
];

const pharmacyOrderSchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "pharmacy", "imported"],
      default: "pharmacy",
    },

    medicationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
      index: true,
    },

    dosage: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    instructions: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: WORKFLOW_STAGES,
      default: "prescribed",
      index: true,
    },

    priority: {
      type: String,
      enum: ["routine", "urgent"],
      default: "routine",
      index: true,
    },

    barcode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    prescribedByName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    prescribedByPhone: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    dispensedBy: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "pending"],
      default: "pending",
    },
  },
  { timestamps: true },
);

pharmacyOrderSchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "pharmacy", "imported"],
  defaultSource: "pharmacy",
  defaultCreatedContext: "facility-chart",
  providerOwnedSources: ["provider", "pharmacy"],
});

pharmacyOrderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const PHARMACY_ORDER_WORKFLOW_STAGES = WORKFLOW_STAGES;
export const pharmacyOrderModel = mongoose.model("PharmacyOrder", pharmacyOrderSchema);
