import mongoose from "mongoose";

const { Schema } = mongoose;

// Connects one website patient account to one mobile account. Both people consent: the website
// side makes a one-time code, the mobile side enters it.
const mobileLinkSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, unique: true },
    profileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true },
    codeHash: { type: String, default: null, index: true },
    codeExpiresAt: { type: Date, default: null },
    mobileAccountId: { type: String, default: null },
    linkedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

mobileLinkSchema.index({ mobileAccountId: 1 }, { unique: true, partialFilterExpression: { mobileAccountId: { $type: "string" } } });

export const MobileLink = mongoose.models.MobileLink || mongoose.model("MobileLink", mobileLinkSchema);
