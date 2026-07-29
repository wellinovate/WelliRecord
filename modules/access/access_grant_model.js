import mongoose from "mongoose";

const { Schema } = mongoose;

const accessGrantSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      default: null,
      index: true,
    },

    granteeType: {
      type: String,
      enum: ["provider", "organization", "caregiver", "payer", "other", "link"],
      required: true,
      index: true,
    },

    // Only present for granteeType "link" — the WelliBridge share link/QR
    // flow. Lets a provider with no WelliRecord account view a scoped,
    // time-limited slice of the patient's record without logging in.
    shareToken: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true,
    },

    // If true, the link becomes unusable after its first successful view
    // rather than staying valid until expiresAt.
    oneTimeUse: {
      type: Boolean,
      default: false,
    },

    usedAt: {
      type: Date,
      default: null,
    },

    granteeUserId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      default: null,
      index: true,
    },

    granteeOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      default: null,
      index: true,
    },

    accessScope: {
      type: String,
      enum: ["single-record", "category", "encounter", "full-record", "custom"],
      required: true,
      index: true,
    },

    category: {
      type: String,
      enum: [
        "vitals",
        "medications",
        "allergies",
        "diagnoses",
        "lab-results",
        "procedures",
        "immunizations",
      ],
      default: null,
      index: true,
    },

    recordId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    encounterId: {
      type: Schema.Types.ObjectId,
      ref: "Encounter",
      default: null,
      index: true,
    },

    /**
     * This controls WHICH RECORD DATES the provider can see.
     * null recordFrom means: from the beginning of the patient's history.
     * null recordTo means: up to now / ongoing.
     */
    recordFrom: {
      type: Date,
      default: null,
      index: true,
    },

    recordTo: {
      type: Date,
      default: null,
      index: true,
    },

    /**
     * This controls HOW LONG the grant itself is valid.
     */
    startsAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    permissions: {
      view: {
        type: Boolean,
        default: true,
      },
      download: {
        type: Boolean,
        default: false,
      },
      reshare: {
        type: Boolean,
        default: false,
      },
      write: {
        type: Boolean,
        default: false,
      },
    },

    purpose: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "active", "revoked", "expired", "rejected"],
      default: "active",
      index: true,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

accessGrantSchema.pre("validate", function () {
  if (this.expiresAt && this.expiresAt <= this.startsAt) {
    throw new Error("expiresAt must be later than startsAt");
  }

  if (this.recordFrom && this.recordTo && this.recordTo <= this.recordFrom) {
    throw new Error("recordTo must be later than recordFrom");
  }

  if (this.granteeType === "provider" && !this.granteeUserId) {
    throw new Error("granteeUserId is required for provider grants");
  }

  if (this.granteeType === "organization" && !this.granteeOrganizationId) {
    throw new Error("granteeOrganizationId is required for organization grants");
  }

  if (this.granteeType === "link" && !this.shareToken) {
    throw new Error("shareToken is required for link grants");
  }

  if (this.accessScope === "category" && !this.category) {
    throw new Error("category is required for category access");
  }

  if (this.accessScope === "single-record" && !this.recordId) {
    throw new Error("recordId is required for single-record access");
  }

  if (this.accessScope === "encounter" && !this.encounterId) {
    throw new Error("encounterId is required for encounter access");
  }

  if (this.status === "active" && !this.reviewedAt) {
    this.reviewedAt = new Date();
  }

  if (this.status === "revoked" && !this.revokedAt) {
    this.revokedAt = new Date();
  }
});

accessGrantSchema.index({
  patientId: 1,
  granteeUserId: 1,
  status: 1,
  startsAt: 1,
  expiresAt: 1,
});

accessGrantSchema.index({
  patientId: 1,
  granteeOrganizationId: 1,
  status: 1,
  startsAt: 1,
  expiresAt: 1,
});

accessGrantSchema.index({
  patientId: 1,
  accessScope: 1,
  category: 1,
  status: 1,
});

accessGrantSchema.index({
  requestedBy: 1,
  status: 1,
  createdAt: -1,
});

export const accessGrantModel = mongoose.model("AccessGrant", accessGrantSchema);