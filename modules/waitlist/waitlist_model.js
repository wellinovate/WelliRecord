import mongoose from "mongoose";

const { Schema } = mongoose;

const waitlistSchema = new Schema(
  {
    feature: {
      type: String,
      required: true,
      enum: ["reports", "public-health"],
      index: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

waitlistSchema.index({ feature: 1, email: 1 }, { unique: true });

export const Waitlist = mongoose.model("Waitlist", waitlistSchema);
