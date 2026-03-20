import mongoose from "mongoose";
const { Schema } = mongoose;

const patientIdentitySchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
      index: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: null,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      index: true,
    },

    // 🔥 CRITICAL
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    isAccountLinked: {
      type: Boolean,
      default: false,
      index: true,
    },

    isProvisional: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdByOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    mergedInto: {
      type: Schema.Types.ObjectId,
      ref: "PatientIdentity",
      default: null,
      index: true,
    },

    isMerged: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// for duplicate detection
patientIdentitySchema.index({
  fullName: "text",
  phone: "text",
  email: "text",
});

export const PatientIdentity = mongoose.model(
  "PatientIdentity",
  patientIdentitySchema
);