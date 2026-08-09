import mongoose from "mongoose";

const { Schema } = mongoose;

const apiKeySchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    keyHash: {
      type: String,
      required: true,
      index: true,
    },

    keyPrefix: {
      type: String,
      required: true,
    },

    scopes: {
      type: [String],
      default: [],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },

    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const ApiKey = mongoose.model("ApiKey", apiKeySchema);
