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
    channel: {
      type: String,
      enum: ["sms", "email"],
      default: "sms",
      required: true,
    },
    // sms channel: Termii generates and stores the pin, and verifies it
    // itself via /api/sms/otp/verify.
    termiiPinId: {
      type: String,
    },
    // email channel: we generate the code, hash it here, and compare on
    // verify — Termii's Verify Token API doesn't support email OTPs.
    codeHash: {
      type: String,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
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
