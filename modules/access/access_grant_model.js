import mongoose from "mongoose";
const Schema = mongoose.Schema;

const accessGrantSchema = new Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    granteeType: {
      type: String,
      enum: ["provider", "organization", "caregiver", "payer", "other"],
      required: true,
      index: true,
    },

    granteeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    granteeOrganizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
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
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    encounterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Encounter",
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
    },

    purpose: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },

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

    status: {
      type: String,
      enum: ["pending", "active", "revoked", "expired", "rejected"],
      default: "pending",
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

accessGrantSchema.pre("save", function (next) {
  try {
    if (this.expiresAt && this.expiresAt <= this.startsAt) {
      return next(new Error("expiresAt must be later than startsAt"));
    }

    if (
      (this.granteeType === "provider" && !this.granteeUserId) ||
      (this.granteeType === "organization" && !this.granteeOrganizationId)
    ) {
      return next(
        new Error("Missing grantee reference for selected granteeType"),
      );
    }

    if (this.status === "active" && !this.reviewedAt) {
      this.reviewedAt = new Date();
    }

    if (this.status === "revoked" && !this.revokedAt) {
      this.revokedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

accessGrantSchema.index({
  patientId: 1,
  granteeOrganizationId: 1,
  status: 1,
});

accessGrantSchema.index({
  patientId: 1,
  granteeUserId: 1,
  status: 1,
});

accessGrantSchema.index({
  requestedBy: 1,
  status: 1,
  createdAt: -1,
});

export const accessGrantModel = mongoose.model("AccessGrant", accessGrantSchema);