import mongoose from "mongoose";

const { Schema } = mongoose;

const deliveryLogSchema = new Schema(
  {
    channel: {
      type: String,
      enum: ["sms", "email", "whatsapp", "in_app"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      required: true,
      index: true,
    },

    recipient: {
      type: String,
      required: true,
    },

    context: {
      type: String,
      default: null, // e.g. "team_invite", "critical_lab_alert", "otp"
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

export const DeliveryLog = mongoose.model("DeliveryLog", deliveryLogSchema);
