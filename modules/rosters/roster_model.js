import mongoose from "mongoose";

const { Schema } = mongoose;

const ROSTER_STATUS = ["draft", "review", "published", "active", "completed"];

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

    department: {
      type: String,
      trim: true,
      default: "General / All Departments",
      maxlength: 120,
    },

    periodStart: {
      type: Date,
      required: true,
    },

    periodEnd: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ROSTER_STATUS,
      default: "draft",
      index: true,
    },

    createdBy: {
      type: String, // authUser.sub — matches recordedBy convention in lab_order_service.js
      required: true,
    },

    reviewedBy: {
      type: String,
      default: null,
    },

    publishedBy: {
      type: String,
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
  { timestamps: true },
);

rosterSchema.index({ organizationId: 1, status: 1, periodStart: -1 });

export const ROSTER_STATUSES = ROSTER_STATUS;
export const rosterModel = mongoose.model("Roster", rosterSchema);
