import mongoose from "mongoose";
const { Schema } = mongoose;

const localCustomerSchema = new Schema(
  {
    // Owning organization
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    // Org's own internal customer/patient ID (from their PMS/LIS/POS)
    externalId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    // Identity fields (from imported data)
    firstName:  { type: String, trim: true, maxlength: 100 },
    lastName:   { type: String, trim: true, maxlength: 100 },
    fullName:   { type: String, trim: true, maxlength: 200, index: true },
    phone:      { type: String, trim: true, maxlength: 30, index: true },
    email:      { type: String, trim: true, lowercase: true, maxlength: 200 },
    dob:        { type: Date, default: null },
    gender:     { type: String, enum: ["male", "female", "other", null], default: null },
    address:    { type: String, trim: true, maxlength: 500 },
    hmo:        { type: String, trim: true, maxlength: 200 },
    lastVisit:  { type: Date, default: null },

    // WelliBridge matching result
    matchStatus: {
      type: String,
      enum: ["pending", "matched", "possible_match", "new", "failed"],
      default: "pending",
      index: true,
    },

    // 0–100 score from the matching engine
    matchConfidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Which signals matched (e.g. ["phone"], ["email", "name"])
    matchedOn: {
      type: [String],
      default: [],
    },

    // For possible_match: array of candidate user IDs with scores for provider review
    matchCandidates: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: "UserProfile" },
          score: Number,
          matchedOn: [String],
        },
      ],
      default: [],
    },

    // Linked WelliRecord account (set after patient claims)
    welliRecordUserId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    // Invitation state
    invitationToken: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    invitationStatus: {
      type: String,
      enum: ["not_sent", "sent", "opened", "registered", "linked", "expired"],
      default: "not_sent",
      index: true,
    },

    invitationSentAt:    { type: Date, default: null },
    invitationExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound indexes for deduplication + querying
localCustomerSchema.index({ organizationId: 1, phone: 1 }, { unique: true, sparse: true });
localCustomerSchema.index({ organizationId: 1, email: 1 }, { unique: true, sparse: true });
localCustomerSchema.index({ organizationId: 1, matchStatus: 1, createdAt: -1 });
localCustomerSchema.index({ organizationId: 1, invitationStatus: 1 });

export const LocalCustomer = mongoose.model("LocalCustomer", localCustomerSchema);
