import mongoose from "mongoose";

const { Schema } = mongoose;

// Internal claims tracking only — the pharmacy records what it
// submitted to an HMO and tracks the status through to payment. This
// does NOT check eligibility or submit anything to a real HMO system;
// there's no signed HMO data-sharing agreement in place yet, so no
// live integration exists to call. hmoName is free text rather than a
// dropdown of "supported" HMOs for the same reason — there's no
// verified partner list to offer.
export const CLAIM_STATUSES = ["submitted", "approved", "rejected", "paid"];

const claimSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    // Denormalized so the claims list doesn't need a join just to
    // show whose claim it is.
    patientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    // The dispensed item(s) this claim covers. A single HMO claim
    // commonly bundles more than one dispensed medication from the
    // same visit, so this is an array rather than a single order.
    orderIds: {
      type: [Schema.Types.ObjectId],
      ref: "PharmacyOrder",
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one dispensed order is required",
      },
    },

    hmoName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    hmoMemberId: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    claimAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // The HMO's own reference/claim number, once they've issued one —
    // not set at submission time, added later when the pharmacy has it.
    claimReference: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    status: {
      type: String,
      enum: CLAIM_STATUSES,
      default: "submitted",
      index: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    decisionAt: {
      type: Date,
      default: null,
    },

    paidAt: {
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

    recordedByAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    recordedByName: {
      type: String,
      trim: true,
      maxlength: 200,
      required: true,
    },
  },
  { timestamps: true },
);

claimSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
claimSchema.index({ organizationId: 1, patientId: 1, createdAt: -1 });

claimSchema.pre("validate", function () {
  if (this.status === "rejected" && !this.rejectionReason) {
    throw new Error("rejectionReason is required when a claim is rejected");
  }
});

export const PharmacyClaim = mongoose.model("PharmacyClaim", claimSchema);
