import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const immunizationEntrySchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "facility", "imported"],
      default: "provider",
    },

    createdContext: {
      ...clinicalMetadataFields.createdContext,
      default: "provider-chart",
    },

    ownershipType: {
      ...clinicalMetadataFields.ownershipType,
      default: "shared",
    },

    providerRetainsAccess: {
      ...clinicalMetadataFields.providerRetainsAccess,
      default: true,
    },

    organizationRetainsAccess: {
      ...clinicalMetadataFields.organizationRetainsAccess,
      default: true,
    },

    vaccineName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
      index: true,
    },

    vaccineCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      index: true,
    },

    manufacturer: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    lotNumber: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    doseNumber: {
      type: Number,
      min: 1,
      default: 1,
    },

    series: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    administrationRoute: {
      type: String,
      enum: ["oral", "im", "sc", "id", "nasal", "other"],
      default: "im",
    },

    site: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    administeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    administeredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    nextDueDate: {
      type: Date,
      default: null,
      index: true,
    },

    immunizationStatus: {
      type: String,
      enum: ["completed", "due", "overdue", "partial", "declined"],
      default: "completed",
      index: true,
    },
  },
  { timestamps: true },
);

immunizationEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "facility", "imported"],
  defaultSource: "provider",
  defaultCreatedContext: "provider-chart",
  providerOwnedSources: ["provider", "facility"],
});

immunizationEntrySchema.pre("save", function (next) {
  try {
    if (
      this.nextDueDate &&
      this.administeredAt &&
      this.nextDueDate < this.administeredAt
    ) {
      return next(new Error("nextDueDate cannot be earlier than administeredAt"));
    }

    if (!this.providerId && this.administeredBy) {
      this.providerId = this.administeredBy;
    }

    next();
  } catch (error) {
    next(error);
  }
});

immunizationEntrySchema.index({ patientId: 1, vaccineName: 1, administeredAt: -1 });

export const immunizationModel = mongoose.model("Immunization", immunizationEntrySchema);