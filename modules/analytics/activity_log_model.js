import mongoose from "mongoose";

const { Schema } = mongoose;

const activityLogSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    providerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    encounterId: {
      type: Schema.Types.ObjectId,
      ref: "Encounter",
      default: null,
      index: true,
    },

    actionType: {
      type: String,
      enum: [
        "encounter_opened",
        "encounter_completed",
        "lab_order_submitted",
        "lab_result_reviewed",
        "prescription_created",
        "record_viewed",
        "consent_requested",
        "consent_granted",
      ],
      required: true,
      index: true,
    },

    message: {
      type: String,
      trim: true,
      maxlength: 500,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

activityLogSchema.index({ organizationId: 1, createdAt: -1 });
activityLogSchema.index({ providerId: 1, createdAt: -1 });

export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);