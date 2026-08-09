import mongoose from "mongoose";

const { Schema } = mongoose;

const teamInviteSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    membershipRole: {
      type: String,
      required: true,
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
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending",
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

export const TeamInvite = mongoose.model("TeamInvite", teamInviteSchema);
