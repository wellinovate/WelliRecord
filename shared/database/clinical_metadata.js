import mongoose from "mongoose";

const { Schema } = mongoose;

export const attachmentSubSchema = new Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 100,
    },
  },
  { _id: false },
);

export const clinicalMetadataFields = {
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserProfile",
    required: true,
    index: true,
  },

  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },

  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrganizationProfile",
    default: null,
    index: true,
  },

  encounterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Encounter",
    default: null,
    index: true,
  },

  source: {
    type: String,
    default: "patient",
    index: true,
  },

  createdContext: {
    type: String,
    enum: [
      "patient-app",
      "provider-chart",
      "facility-chart",
      "device",
      "imported",
      "system",
    ],
    default: "patient-app",
    index: true,
  },

  ownershipType: {
    type: String,
    enum: ["patient", "provider", "shared"],
    default: "patient",
    index: true,
  },

  visibility: {
    type: String,
    enum: ["private", "patient-visible", "provider-visible", "shared"],
    default: "shared",
    index: true,
  },

  patientAccess: {
    type: String,
    enum: ["full", "limited", "hidden-until-reviewed"],
    default: "full",
    index: true,
  },

  patientVisible: {
    type: Boolean,
    default: true,
    index: true,
  },

  providerRetainsAccess: {
    type: Boolean,
    default: false,
    index: true,
  },

  organizationRetainsAccess: {
    type: Boolean,
    default: false,
    index: true,
  },

  recordStatus: {
    type: String,
    enum: ["active", "archived", "entered-in-error"],
    default: "active",
    index: true,
  },

  notes: {
    type: String,
    trim: true,
    maxlength: 1500,
  },

  attachments: {
    type: [attachmentSubSchema],
    default: [],
  },
};

export const clinicalMetadataPlugin = (
  schema,
  {
    allowedSources = [
      "patient",
      "provider",
      "facility",
      "lab",
      "pharmacy",
      "device",
      "imported",
    ],
    defaultSource = "patient",
    defaultCreatedContext = "patient-app",
    providerOwnedSources = ["provider", "facility", "lab", "pharmacy"],
  } = {},
) => {
  if (schema.path("source")) {
    schema.path("source").enumValues = allowedSources;
    schema.path("source").defaultValue = defaultSource;
  }

  if (schema.path("createdContext")) {
    schema.path("createdContext").defaultValue = defaultCreatedContext;
  }

  schema.pre("validate", function () {
    const isProviderChart = this.createdContext === "provider-chart";
    const isFacilityChart = this.createdContext === "facility-chart";
    const isProviderOwnedSource = providerOwnedSources.includes(this.source);

    if (!this.providerId && this.recordedBy) {
      if (
        isProviderChart ||
        this.source === "provider" ||
        this.source === "facility"
      ) {
        this.providerId = this.recordedBy;
      }
    }

    if (isProviderChart && !this.providerId) {
      throw new Error(
        "providerId is required when createdContext is provider-chart",
      );
    }

    if (isFacilityChart && !this.organizationId) {
      throw new Error(
        "organizationId is required when createdContext is facility-chart",
      );
    }

    if (isProviderOwnedSource || isProviderChart || isFacilityChart) {
      this.patientVisible = true;
      this.providerRetainsAccess = true;
      this.organizationRetainsAccess = Boolean(this.organizationId);

      if (!this.ownershipType || this.ownershipType === "patient") {
        this.ownershipType = "shared";
      }

      if (this.visibility === "private") {
        this.visibility = "shared";
      }
    }
  });

  schema.index({ patientId: 1, createdAt: -1 });
  schema.index({ patientId: 1, recordStatus: 1 });
  schema.index({ patientId: 1, providerId: 1, createdAt: -1 });
  schema.index({ patientId: 1, organizationId: 1, createdAt: -1 });
  schema.index({ patientId: 1, encounterId: 1, createdAt: -1 });
};
