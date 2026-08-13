import mongoose from "mongoose";

const { Schema } = mongoose;

const organizationMembershipSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      // ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    membershipRole: {
      type: String,
      enum: [
        "provider_admin",
        "doctor",
        "clinician",
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

    specialist: {
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

    // Per-member permission overrides, layered on top of the role's
    // default permission set (see modules/team/permission_registry.js).
    // Effective permission = (role default ∪ granted) − revoked. Empty
    // arrays mean "just the role default, nothing overridden" — the
    // common case.
    permissionOverrides: {
      granted: { type: [String], default: [] },
      revoked: { type: [String], default: [] },
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