import mongoose from "mongoose";

const { Schema } = mongoose;

// One row per "prove you control this WR-ID" request from WelliPay. Only a
// hash of the code is stored. Rows delete themselves after the code expires.
const wellipayVerificationSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true, trim: true },
    reference: { type: String, required: true, trim: true, index: true },
    userProfileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

wellipayVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.models.WellipayVerification ||
  mongoose.model("WellipayVerification", wellipayVerificationSchema);
