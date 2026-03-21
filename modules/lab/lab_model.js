import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const labResultEntrySchema = new Schema(
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

    specimen: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    resultValue: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    unit: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    referenceRange: {
      min: {
        type: Number,
        default: null,
      },
      max: {
        type: Number,
        default: null,
      },
      text: {
        type: String,
        trim: true,
        maxlength: 100,
      },
    },

    interpretation: {
      type: String,
      enum: ["low", "normal", "high", "positive", "negative", "abnormal", "unknown"],
      default: "unknown",
      index: true,
    },

    orderedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    collectedAt: {
      type: Date,
      default: null,
      index: true,
    },

    resultedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    verificationStatus: {
      type: String,
      enum: ["unverified", "patient-uploaded", "provider-reviewed", "lab-verified"],
      default: "unverified",
      index: true,
    },
  },
  { timestamps: true },
);

labResultEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "lab", "imported"],
  defaultSource: "lab",
  defaultCreatedContext: "facility-chart",
  providerOwnedSources: ["provider", "lab"],
});

labResultEntrySchema.pre("save", function () {
  if (
    this.collectedAt &&
    this.resultedAt &&
    this.resultedAt < this.collectedAt
  ) {
    throw new Error("resultedAt cannot be earlier than collectedAt");
  }

  if (!this.providerId && this.performedBy) {
    this.providerId = this.performedBy;
  }
});

labResultEntrySchema.index({ patientId: 1, testName: 1, resultedAt: -1 });

export const labResultModel = mongoose.model("LabResult", labResultEntrySchema);