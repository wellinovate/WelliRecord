import mongoose from "mongoose";
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    reference: { type: String, required: true },
    amountKobo: { type: Number, default: 0 },
    months: { type: Number, required: true },
    source: { type: String, default: "manual" }, // "manual" now; a payment gateway webhook would use its own name
    recordedBy: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
    periodEndAfter: { type: Date },
  },
  { _id: false },
);

// One per provider organisation. organizationId is the organisation's Account id
// (OrganizationProfile.accountId), the same id the rest of the provider side uses.
const subscriptionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    planKey: { type: String, default: "" },
    plan: { type: String, default: "" },
    trial: { type: Boolean, default: false }, // true until the first payment
    amountKobo: { type: Number, default: 0 },
    periodEnd: { type: Date, required: true },
    graceDays: { type: Number, default: 5, min: 3, max: 5 },
    exempt: { type: Boolean, default: false }, // pilot or partner accounts that are never blocked
    // Last state the sweep saw. The gate does not rely on it: it works the state out from the dates.
    status: { type: String, enum: ["active", "grace", "suspended", "none"], default: "active" },
    endedNoticeFor: { type: String, default: "" }, // period end (ISO) the "ended" notice was sent for
    suspendedNoticeFor: { type: String, default: "" },
    suspendedAt: { type: Date },
    resumedAt: { type: Date },
    payments: { type: [paymentSchema], default: [] },
  },
  { timestamps: true },
);

export const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
