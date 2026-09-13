import mongoose from "mongoose";
import { generateEncounterCode } from "../../shared/utils/helper.js";
const Schema = mongoose.Schema;

const encounterSchema = new Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile",
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
      ref: "OrganizationProfile",
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

    queueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VisitQueue",
      default: null,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },
    visitSource: {
      type: String,
      enum: ["appointment", "walk-in"],
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "scheduled",
        "active",
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

    followUpRecommended: {
      type: Boolean,
      default: false,
      index: true,
    },

    followUpDate: {
      type: Date,
      default: null,
      index: true,
    },

    followUpReminderStage: {
      // Tracks which reminder in the day 1 / day 7 / day 30 cadence has
      // already fired, so the sweep never sends the same stage twice and
      // always knows what's next — mirrors reminderSentAt's role on
      // Appointment, but needs a stage rather than a single timestamp
      // since there are three reminders, not one.
      type: String,
      enum: ["none", "day1_sent", "day7_sent", "day30_sent"],
      default: "none",
      index: true,
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
encounterSchema.index({ followUpRecommended: 1, followUpDate: 1, followUpReminderStage: 1 });

export const Encounter = mongoose.model("Encounter", encounterSchema);
