import mongoose from "mongoose";

const { Schema } = mongoose;

const organizationMembershipSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    membershipRole: {
      type: String,
      enum: [
        "provider_admin",
        "doctor",
        "nurse",
        "lab_tech",
        "pharmacist",
        "frontdesk",
        "insurer_agent",
        "support_staff",
      ],
      required: true,
      index: true,
    },

    department: {
      type: String,
      trim: true,
      default: null,
    },

    title: {
      type: String,
      trim: true,
      default: null,
    },

    isPrimary: {
      type: Boolean,
      default: false,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

organizationMembershipSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);

export const OrganizationMembership = mongoose.model(
  "OrganizationMembership",
  organizationMembershipSchema,
);