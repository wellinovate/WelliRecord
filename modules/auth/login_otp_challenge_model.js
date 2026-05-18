import mongoose from "mongoose";

const { Schema } = mongoose;

const loginOtpChallengeSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    challengeTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    termiiPinId: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    maxAttempts: {
      type: Number,
      default: 3,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },

    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const LoginOtpChallenge = mongoose.model(
  "LoginOtpChallenge",
  loginOtpChallengeSchema
);