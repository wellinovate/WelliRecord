import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationTemplateSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    channel: {
      type: String,
      enum: ["sms", "email", "whatsapp", "in_app"],
      required: true,
    },

    subject: {
      type: String,
      trim: true,
      default: null,
    },

    body: {
      type: String,
      required: true,
    },

    variables: {
      type: [String],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
  },
  { timestamps: true },
);

export const NotificationTemplate = mongoose.model(
  "NotificationTemplate",
  notificationTemplateSchema,
);
