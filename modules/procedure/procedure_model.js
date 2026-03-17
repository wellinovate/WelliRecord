import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const procedureEntrySchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "facility", "imported"],
      default: "provider",
    },

    procedureName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
      index: true,
    },

    procedureType: {
      type: String,
      enum: ["surgical", "diagnostic", "therapeutic", "minor", "major", "other"],
      default: "other",
      index: true,
    },

    bodySite: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    indication: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    outcome: {
      type: String,
      enum: ["successful", "partial", "complication", "failed", "unknown"],
      default: "unknown",
      index: true,
    },

    complications: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    facilityName: {
      type: String,
      trim: true,
      maxlength: 250,
    },

    performedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    clinicalStatus: {
      type: String,
      enum: ["completed", "partial", "cancelled", "entered-in-error"],
      default: "completed",
      index: true,
    },
  },
  { timestamps: true },
);

procedureEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "facility", "imported"],
  defaultSource: "provider",
  defaultCreatedContext: "provider-chart",
  providerOwnedSources: ["provider", "facility"],
});

procedureEntrySchema.pre("save", function (next) {
  try {
    if (!this.providerId && this.performedBy) {
      this.providerId = this.performedBy;
    }
    next();
  } catch (error) {
    next(error);
  }
});

procedureEntrySchema.index({ patientId: 1, procedureName: 1, performedAt: -1 });

export const procedureModel = mongoose.model("Procedure", procedureEntrySchema);