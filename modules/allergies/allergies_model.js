import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const allergyEntrySchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "lab", "imported"],
      default: "patient",
    },

    allergen: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    allergyType: {
      type: String,
      enum: ["drug", "food", "environment", "insect", "other"],
      required: true,
      index: true,
    },

    reaction: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    severity: {
      type: String,
      enum: ["mild", "moderate", "severe", "life-threatening", "unknown"],
      default: "unknown",
      index: true,
    },

    clinicalStatus: {
      type: String,
      enum: ["active", "resolved", "entered-in-error"],
      default: "active",
      index: true,
    },

    onsetDate: {
      type: Date,
      default: null,
      index: true,
    },

    lastReactionDate: {
      type: Date,
      default: null,
      index: true,
    },

    resolvedAt: {
      type: Date,
      default: null,
      index: true,
    },

    confirmed: {
      type: Boolean,
      default: false,
      index: true,
    },

    verificationStatus: {
      type: String,
      enum: ["unverified", "patient-reported", "provider-verified", "lab-supported"],
      default: "unverified",
      index: true,
    },
  },
  { timestamps: true },
);

allergyEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "lab", "imported"],
  defaultSource: "patient",
  defaultCreatedContext: "patient-app",
  providerOwnedSources: ["provider", "lab"],
});

allergyEntrySchema.pre("save", function (next) {
  try {
    if (
      this.onsetDate &&
      this.lastReactionDate &&
      this.lastReactionDate < this.onsetDate
    ) {
      return next(new Error("lastReactionDate cannot be earlier than onsetDate"));
    }

    if (this.resolvedAt && this.onsetDate && this.resolvedAt < this.onsetDate) {
      return next(new Error("resolvedAt cannot be earlier than onsetDate"));
    }

    if (this.clinicalStatus === "resolved" && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

allergyEntrySchema.index({
  patientId: 1,
  allergen: 1,
  allergyType: 1,
  clinicalStatus: 1,
});

export const allergyModel = mongoose.model("Allergy", allergyEntrySchema);