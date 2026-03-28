import mongoose from "mongoose";
import { generateEncounterCode } from "../../shared/utils/helper.js";
const Schema = mongoose.Schema;

const encounterSchema = new Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    encounterLabel: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    encounterTitle: {
      type: String,
      trim: true,
    },

    encounterCode: {
      type: String,
      unique: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },

    encounterType: {
      type: String,
      enum: [
        "outpatient",
        "inpatient",
        "emergency",
        "telemedicine",
        "homecare",
      ],
      default: "outpatient",
      index: true,
    },

    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },

    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    endedAt: {
      type: Date,
      default: null,
      index: true,
    },

    reasonForVisit: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    chiefComplaint: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    priority: {
      type: String,
      enum: ["routine", "urgent", "high", "critical"],
      default: "routine",
      index: true,
    },

    source: {
      type: String,
      enum: ["provider", "organization", "patient", "imported", "system"],
      default: "provider",
      index: true,
    },

    status: {
      type: String,
      enum: [
        "scheduled",
        "checked-in",
        "in-progress",
        "completed",
        "cancelled",
        "no-show",
      ],
      default: "scheduled",
      index: true,
    },

    visibilityToPatient: {
      type: Boolean,
      default: true,
      index: true,
    },

    patientAccess: {
      type: String,
      enum: ["full", "limited", "hidden-until-reviewed"],
      default: "full",
      index: true,
    },

    recordStatus: {
      type: String,
      enum: ["active", "archived", "entered-in-error"],
      default: "active",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
  },
  { timestamps: true },
);

encounterSchema.pre("save", function () {
  if (this.endedAt && this.startedAt && this.endedAt < this.startedAt) {
    throw new Error("endedAt cannot be earlier than startedAt");
  }

  if (this.scheduledAt && this.startedAt && this.startedAt < this.scheduledAt) {
    // allow walk-in / early-start if needed
  }
  if (!this.encounterCode) {
    this.encounterCode = generateEncounterCode(Encounter);
  }
});

encounterSchema.index({ organizationId: 1, scheduledAt: 1, status: 1 });
encounterSchema.index({ providerId: 1, scheduledAt: 1, status: 1 });
encounterSchema.index({ patientId: 1, startedAt: -1 });

export const Encounter = mongoose.model("Encounter", encounterSchema);

