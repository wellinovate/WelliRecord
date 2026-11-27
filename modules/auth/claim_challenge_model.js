import mongoose from "mongoose";
const { Schema } = mongoose;

const claimChallengeSchema = new Schema(
  {
    profileId: { type: Schema.Types.ObjectId, required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const ClaimChallenge = mongoose.model("ClaimChallenge", claimChallengeSchema);
