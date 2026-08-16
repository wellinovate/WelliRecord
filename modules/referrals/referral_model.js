import mongoose from "mongoose";

const { Schema } = mongoose;

// A referral is a handoff between two organizations about a specific
// patient — it does not itself grant record access. Sharing the
// patient's actual clinical record with the receiving facility still
// goes through the existing consent system (WelliBridge share link or
// an access grant), which the referring provider can create
// separately. Bundling automatic record access into referral creation
// would bypass patient consent for a data-sharing event the patient
// never approved.
const referralSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    // Denormalized so the referral list doesn't need a join just to
    // show who the referral is about.
    patientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    referringOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },
    referringOrganizationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    referringProviderAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    referringProviderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    receivingOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },
    receivingOrganizationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    specialty: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,
    },

    urgency: {
      type: String,
      enum: ["routine", "urgent", "emergency"],
      default: "routine",
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    clinicalSummary: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "completed", "cancelled"],
      default: "pending",
      index: true,
    },

    responseNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    respondedAt: {
      type: Date,
      default: null,
    },

    respondedByAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    respondedByName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
  },
  { timestamps: true },
);

referralSchema.index({ referringOrganizationId: 1, createdAt: -1 });
referralSchema.index({ receivingOrganizationId: 1, status: 1, createdAt: -1 });

referralSchema.pre("validate", function () {
  if (
    this.isNew &&
    String(this.referringOrganizationId) === String(this.receivingOrganizationId)
  ) {
    throw new Error("A referral must go to a different organization than the referring one");
  }
});

export const Referral = mongoose.model("Referral", referralSchema);
