import mongoose from "mongoose";
import { STATUSES } from "./record_link_logic.js";

const { Schema } = mongoose;

const historySchema = new Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "system" }, // "staff:<accountId>", "patient:<accountId>" or "system"
    note: { type: String, default: "" },
  },
  { _id: false },
);

const stagedSchema = new Schema(
  {
    kind: { type: String, enum: ["allergy", "medication"], required: true },
    data: { type: Schema.Types.Mixed, required: true },
    sourceRef: { type: String, default: "" }, // the hospital's own identifier for the entry
    stagedAt: { type: Date, default: Date.now },
    stagedBy: { type: Schema.Types.ObjectId, ref: "Account" },
  },
  { _id: false },
);

// One hospital patient being linked to one WelliRecord account.
// Staged items are held here, away from the patient's record, until the hospital releases them.
const recordLinkSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true }, // OrganizationProfile._id
    localCustomerId: { type: Schema.Types.ObjectId, ref: "LocalCustomer", required: true, index: true },

    status: { type: String, enum: STATUSES, default: "not_initiated", index: true },
    statusHistory: { type: [historySchema], default: [] },
    actionReason: { type: String, default: "" }, // why it needs attention (staff-facing)

    initiatedBy: { type: Schema.Types.ObjectId, ref: "Account", required: true },

    // The link token is shown once to the hospital. Only its hash is stored.
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },

    // Who verified: the signed-in WelliRecord account that passed the code and identity check.
    patientProfileId: { type: Schema.Types.ObjectId, ref: "UserProfile", default: null, index: true },
    claimantAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    verifiedAt: { type: Date, default: null },
    verifiedMethod: { type: String, enum: ["dob", "name", null], default: null },
    verificationWeak: { type: Boolean, default: false },

    // One-time code sent to the phone the hospital holds.
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    otpLifetimeFails: { type: Number, default: 0 },
    otpLockedUntil: { type: Date, default: null },
    otpSendTimes: { type: [Date], default: [] },

    consentAt: { type: Date, default: null },
    consentVersion: { type: String, default: null },
    consentScopes: { type: [String], default: [] },

    releasedBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    releasedAt: { type: Date, default: null },
    releaseNote: { type: String, default: "" },

    staged: { type: [stagedSchema], default: [] },
    transferred: {
      type: new Schema(
        { allergies: { type: Number, default: 0 }, medications: { type: Number, default: 0 }, skipped: { type: Number, default: 0 }, failed: { type: Number, default: 0 } },
        { _id: false },
      ),
      default: () => ({}),
    },
    transferredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Only one open link per hospital patient.
recordLinkSchema.index(
  { organizationId: 1, localCustomerId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["not_initiated", "awaiting_patient_verification", "awaiting_consent", "under_hospital_review", "linking_in_progress", "action_required"] } } },
);

export const RecordLink = mongoose.models.RecordLink || mongoose.model("RecordLink", recordLinkSchema);

const auditSchema = new Schema(
  {
    linkId: { type: Schema.Types.ObjectId, ref: "RecordLink", required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true },
    actorType: { type: String, enum: ["staff", "patient", "system"], required: true },
    actorId: { type: String, default: "" },
    detail: { type: String, default: "", maxlength: 400 },
    ip: { type: String, default: "" }, // last part masked
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export const RecordLinkAudit = mongoose.models.RecordLinkAudit || mongoose.model("RecordLinkAudit", auditSchema);
