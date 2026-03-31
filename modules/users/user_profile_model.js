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
