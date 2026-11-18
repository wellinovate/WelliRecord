import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

import { STAGES } from "./lab_order_rules.js";

const WORKFLOW_STAGES = STAGES;

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

    // Key of the structured test in the catalog (lab_test_catalog_v2.js). Empty for older orders.
    testKey: { type: String, trim: true, maxlength: 60, index: true },

    // Entered values with unit, reference text and flag, produced by lab_result_engine.js.
    results: { type: [Schema.Types.Mixed], default: undefined },
    // Large changes from the same patient's previous result of this test (see lab_delta_rules.js).
    deltaFlags: { type: [Schema.Types.Mixed], default: undefined },

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

    // Set by the server from the signed-in user, never from the request.
    enteredBy: { type: String, trim: true },
    enteredByName: { type: String, trim: true, maxlength: 200 },
    enteredAt: { type: Date },
    verifiedByUserId: { type: String, trim: true },
    verifiedAt: { type: Date },
    selfVerified: { type: Boolean, default: false },
    rejectionReason: { type: String, trim: true, maxlength: 300 },

    stageHistory: {
      type: [
        {
          _id: false,
          status: { type: String, required: true },
          at: { type: Date, required: true },
          byUserId: { type: String },
          byName: { type: String, maxlength: 200 },
        },
      ],
      default: [],
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
