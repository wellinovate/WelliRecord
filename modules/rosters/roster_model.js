import mongoose from "mongoose";

const { Schema } = mongoose;

const ROSTER_STATUSES = ["draft", "review", "published", "archived"];

const rosterSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ROSTER_STATUSES,
      default: "draft",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1500,
    },
  },
  { timestamps: true }
);

rosterSchema.index({ organizationId: 1, periodStart: -1 });

export const ROSTER_STATUS_VALUES = ROSTER_STATUSES;
export const rosterModel = mongoose.model("Roster", rosterSchema);
