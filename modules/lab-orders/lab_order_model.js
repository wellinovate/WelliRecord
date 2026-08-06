import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const WORKFLOW_STAGES = [
  "requested",
  "collected",
  "received",
  "processing",
  "quality-control",
  "verified",
  "released",
  "delivered",
];

const labOrderSchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "lab", "imported"],
      default: "lab",
    },

    testName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
      index: true,
    },

    category: {
      type: String,
      enum: [
        "hematology",
        "chemistry",
        "microbiology",
        "serology",
        "urinalysis",
        "pathology",
        "other",
      ],
      default: "other",
      index: true,
    },

    status: {
      type: String,
      enum: WORKFLOW_STAGES,
      default: "requested",
      index: true,
    },

    priority: {
      type: String,
      enum: ["routine", "urgent", "home-sample"],
      default: "routine",
      index: true,
    },

    sampleType: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    barcode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    doctorName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    doctorPhone: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    collector: {
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

    isCritical: {
      type: Boolean,
      default: false,
      index: true,
    },

    measuredValue: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    normalRange: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    interpretation: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    verifiedBy: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true },
);

labOrderSchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "lab", "imported"],
  defaultSource: "lab",
  defaultCreatedContext: "facility-chart",
  providerOwnedSources: ["provider", "lab"],
});

labOrderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const LAB_ORDER_WORKFLOW_STAGES = WORKFLOW_STAGES;
export const labOrderModel = mongoose.model("LabOrder", labOrderSchema);
