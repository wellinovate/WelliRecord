import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const diagnosisEntrySchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "imported"],
      default: "provider",
    },

    diagnosisName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
      index: true,
    },

    diagnosisType: {
      type: String,
      enum: ["provisional", "confirmed", "chronic", "resolved", "ruled-out"],
      default: "provisional",
      index: true,
    },

    icd10Code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
      index: true,
    },

    clinicalStatus: {
      type: String,
      enum: ["active", "inactive", "resolved", "remission", "unknown"],
      default: "active",
      index: true,
    },

    onsetDate: {
      type: Date,
      default: null,
      index: true,
    },

    diagnosedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    resolvedAt: {
      type: Date,
      default: null,
      index: true,
    },

    diagnosedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

diagnosisEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "imported"],
  defaultSource: "provider",
  defaultCreatedContext: "provider-chart",
  providerOwnedSources: ["provider"],
});

diagnosisEntrySchema.pre("save", function () {
  if (this.resolvedAt && this.diagnosedAt && this.resolvedAt < this.diagnosedAt) {
    throw new Error("resolvedAt cannot be earlier than diagnosedAt");
  }

  if (this.clinicalStatus === "resolved" && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }

  if (!this.providerId && this.diagnosedBy) {
    this.providerId = this.diagnosedBy;
  }
});

diagnosisEntrySchema.index({
  patientId: 1,
  diagnosisName: 1,
  clinicalStatus: 1,
});

export const diagnosisModel = mongoose.model("Diagnosis", diagnosisEntrySchema);