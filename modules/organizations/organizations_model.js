import mongoose from "mongoose";

const { Schema } = mongoose;

const organizationProfileSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },
    wrOrgId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    organizationName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    organizationType: {
      type: String,
      enum: [
        "healthcare_provider", // hospital + clinic + lab + pharmacy
        "diagnostic", // standalone lab centers
        "pharmacy", // standalone pharmacy chains
        "insurance", // insurers / HMOs
        "telehealth", // virtual care platforms
        "government", // ministries, public health bodies
        "ngo", // non-profits
        "healthtech", // tech companies (like WelliRecord)
        "vendor", // devices, wearables, suppliers
        "other",
      ],
      required: true,
      index: true,
    },

    officeAddress: {
      type: String,
      trim: true,
      default: null,
    },

    registrationNumber: {
      type: String,
      trim: true,
      default: null,
    },

    licenseNumber: {
      type: String,
      trim: true,
      default: null,
    },

    contactPersonName: {
      type: String,
      trim: true,
      default: null,
    },

    logo: {
      type: String,
      default: null,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
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

    contactPersonRole: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

organizationProfileSchema.index({ organizationName: "text" });

export const OrganizationProfile = mongoose.model(
  "OrganizationProfile",
  organizationProfileSchema,
);
