import { mapLga } from "../../shared/utils/lga.js";
import mongoose from "mongoose";
import { issueWelliId } from "../../shared/utils/welliId.js";

const { Schema } = mongoose;

const emergencyContactSchema = new Schema(
  {
    name: { type: String, trim: true, required: true },
    relationship: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, required: true },
  },
  { _id: false },
);

const notificationPreferencesSchema = new Schema(
  {
    labResultsReady: { type: Boolean, default: true },
    consentRequests: { type: Boolean, default: true },
    appointmentReminders: { type: Boolean, default: true },
    emergencyModeAlerts: { type: Boolean, default: true },
    medicationReminders: { type: Boolean, default: false },
    accessAuditLog: { type: Boolean, default: false },
    preventiveCareReminders: { type: Boolean, default: false },
  },
  { _id: false },
);

const userProfileSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },

    wrId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    // Where the person registered (fixed when the WelliID is issued) and where they live now (editable).
    // The WelliID never changes when they move.
    registrationRegion: { type: String, trim: true, index: true },
    registrationState: { type: String, trim: true },
    registeredAt: { type: Date },
    residenceState: { type: String, trim: true, index: true },
    residenceLga: { type: String, trim: true, maxlength: 60 },
    // Original LGA text, canonical code when confidently matched, and how sure the match is. Never part of the WelliID.
    lgaText: { type: String, trim: true, maxlength: 60 },
    lgaCode: { type: String, trim: true, index: true },
    lgaMappingStatus: { type: String, enum: ["verified", "unverified", "needs_review"], index: true },
    // Set by a records officer who checked an identity document. The document number is not stored.
    identityVerifiedAt: { type: Date },
    identityVerifiedBy: { type: String, trim: true },
    identityVerifiedMethod: { type: String, trim: true },
    lastActiveAt: { type: Date, index: true },

    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    username: {
      type: String,
      trim: true,
      unique: false,
      sparse: true,
      index: true,
    },

    firstName: {
      type: String,
      trim: true,
      default: "",
    },

    middleName: {
      type: String,
      trim: true,
      default: "",
    },

    lastName: {
      type: String,
      trim: true,
      default: "",
    },

    gender: {
      type: String,
      // required: true,
      enum: ["Male", "Female", "Other"],
      default: null,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    homeAddress: {
      type: String,
      trim: true,
      default: null,
    },

    googleId: { type: String, default: null, index: true },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    isEmailVerified: { type: Boolean, default: false },
    avatar: { type: String, default: "" },

    logo: {
      type: String,
      default: null,
    },

    phone: {
      type: String,
      // required: true,
      trim: true,
      default: null,
    },
    patientIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "PatientIdentity",
      default: null,
      index: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    isLicensed: {
      type: Boolean,
      default: false,
      index: true,
    },

    emergencyContacts: {
      type: [emergencyContactSchema],
      default: [],
    },

    // Self-reported during onboarding wizard. Not treated as clinically
    // verified — lab results are the authoritative source when they exist.
    bloodGroup: {
      type: String,
      enum: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "Unknown", null],
      default: null,
    },

    genotype: {
      type: String,
      enum: ["AA", "AS", "AC", "SS", "SC", "Unknown", null],
      default: null,
    },

    // Tracks explicit "I have none of these" answers from the medical
    // profile checklist (see MedicalProfileWizard). This is onboarding
    // metadata, not a clinical claim — it exists only so the completion
    // score can distinguish "confirmed none" from "not asked yet"
    // without creating fake allergy/medication/diagnosis records.
    confirmedNone: {
      allergies: { type: Boolean, default: false },
      medications: { type: Boolean, default: false },
      diagnoses: { type: Boolean, default: false },
    },

    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
    // Patient self-reported insurance info — NOT verified against any
    // HMO system (no live HMO integration exists; the data-sharing
    // agreement required for that isn't signed). This is exactly the
    // same trust level as home address or emergency contacts: the
    // patient enters what they know about their own coverage, and
    // WelliRecord stores it, nothing more. Never render this as if it
    // were a verified eligibility/coverage check.
    insurance: {
      hmoName: { type: String, trim: true, maxlength: 200, default: null },
      membershipId: { type: String, trim: true, maxlength: 100, default: null },
      planName: { type: String, trim: true, maxlength: 200, default: null },
      dependents: {
        type: [
          {
            name: { type: String, trim: true, maxlength: 200, required: true },
            relationship: { type: String, trim: true, maxlength: 100, default: null },
            membershipId: { type: String, trim: true, maxlength: 100, default: null },
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userProfileSchema.index({ fullName: "text", username: "text" });

// A new profile gets a WelliID like WR-ABJ1-2RWR. The state to use is the registrationState hint set by
// the signup code; with none, the ID carries the "not stated" region (UNK). The unique index on wrId is
// what stops two profiles sharing an ID; the lookup here only makes a clash unlikely.
userProfileSchema.pre("validate", async function () {
  if (this.wrId) return;

  const issued = await issueWelliId({
    state: this.registrationState || this.residenceState,
    exists: async (id) => Boolean(await this.constructor.exists({ wrId: id })),
  });
  this.wrId = issued.id;
  this.registrationRegion = issued.region.code;
  this.registrationState = issued.hasRegion ? issued.region.name : "";
  if (!this.residenceState && issued.hasRegion) this.residenceState = issued.region.name;
  if (!this.registeredAt) this.registeredAt = new Date();
  if (!this.lgaMappingStatus) {
    Object.assign(this, mapLga(issued.region.code, this.lgaText || this.residenceLga, this.lgaCode));
    this.residenceLga = this.lgaText || undefined;
  }
});

export const UserProfile = mongoose.model("UserProfile", userProfileSchema);
