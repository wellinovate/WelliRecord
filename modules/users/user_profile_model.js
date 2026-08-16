import mongoose from "mongoose";

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

const generateWelliRecordId = () => {
  const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `WR-${part1}-${part2}`;
};

userProfileSchema.pre("validate", async function () {
  if (this.wrId) return;

  let exists = true;

  while (exists) {
    const wrId = generateWelliRecordId();
    const existingProfile = await this.constructor.findOne({ wrId });

    if (!existingProfile) {
      this.wrId = wrId;
      exists = false;
    }
  }
});

export const UserProfile = mongoose.model("UserProfile", userProfileSchema);
