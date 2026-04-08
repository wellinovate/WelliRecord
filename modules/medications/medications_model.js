import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const medicationEntrySchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "pharmacy", "imported"],
      default: "patient",
    },

    medicationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    genericName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    brandName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    dosage: {
      value: {
        type: Number,
        min: 0,
      },
      unit: {
        type: String,
        trim: true,
        maxlength: 50,
      },
    },

    form: {
      type: String,
      enum: [
        "tablet",
        "capsule",
        "syrup",
        "injection",
        "cream",
        "ointment",
        "drops",
        "inhaler",
        "suppository",
        "patch",
        "other",
      ],
      default: "other",
    },

    route: {
      type: String,
      enum: [
        "oral",
        "iv",
        "im",
        "sc",
        "topical",
        "inhalation",
        "rectal",
        "nasal",
        "ophthalmic",
        "otic",
        "other",
      ],
      default: "oral",
    },

    frequency: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    duration: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    indication: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    prescribedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      default: null,
      index: true,
    },

    prescribedAt: {
      type: Date,
      default: null,
      index: true,
    },

    startDate: {
      type: Date,
      default: null,
      index: true,
    },

    endDate: {
      type: Date,
      default: null,
      index: true,
    },

    medicationStatus: {
      type: String,
      enum: ["active", "completed", "stopped", "on-hold"],
      default: "active",
      index: true,
    },

    adherence: {
      type: String,
      enum: ["unknown", "good", "partial", "poor"],
      default: "unknown",
      index: true,
    },
  },
  { timestamps: true },
);

medicationEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "pharmacy", "imported"],
  defaultSource: "patient",
  defaultCreatedContext: "patient-app",
  providerOwnedSources: ["provider", "pharmacy"],
});

medicationEntrySchema.pre("save", function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    throw new Error("endDate cannot be earlier than startDate");
  }

  if (this.medicationStatus === "completed" && !this.endDate) {
    this.endDate = new Date();
  }

  if (!this.providerId && this.prescribedBy) {
    this.providerId = this.prescribedBy;
  }
});

medicationEntrySchema.index({
  patientId: 1,
  medicationName: 1,
  medicationStatus: 1,
});

export const medicationModel = mongoose.model("Medication", medicationEntrySchema);