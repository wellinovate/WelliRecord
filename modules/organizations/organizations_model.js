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

    organizationName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    organizationType: {
      type: String,
      enum: [
        "clinic",
        "hospital",
        "laboratory",
        "pharmacy",
        "insurer",
        "ngo",
        "healthtech",
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