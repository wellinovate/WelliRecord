import mongoose from "mongoose";

const { Schema } = mongoose;

const identityVerificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["email", "phone"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["unverified", "pending", "verified", "failed", "expired"],
      default: "unverified",
      index: true,
    },

    method: {
      type: String,
      enum: ["otp", "link"],
      default: "otp",
    },

    value: {
      type: String, // email or phone
      required: true,
      index: true,
    },

    verificationCodeHash: {
      type: String,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastSentAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const identitySchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },

    verifications: {
      type: [identityVerificationSchema],
      default: [],
    },

    verificationLevel: {
      type: String,
      enum: ["basic", "trusted"],
      default: "basic",
      index: true,
    },

    trustScore: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const Identity = mongoose.model("Identity", identitySchema);