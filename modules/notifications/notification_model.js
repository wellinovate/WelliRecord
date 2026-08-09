import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    recipientAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "appointment",
        "consent_request",
        "lab_result",
        "team_invite_accepted",
        "critical_alert",
        "system",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    body: {
      type: String,
      required: true,
      trim: true,
    },

    link: {
      type: String,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientAccountId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
