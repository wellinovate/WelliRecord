import mongoose from "mongoose";

const Schema = mongoose.Schema;
const ObjectId = mongoose.Schema.Types.ObjectId;

const visitQueueSchema = new Schema(
  {
    patientId: {
      type: ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    organizationId: {
      type: ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    appointmentId: {
      type: ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },

    providerId: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    encounterId: {
      type: ObjectId,
      ref: "Encounter",
      default: null,
      index: true,
    },

    source: {
      type: String,
      enum: ["appointment", "walk-in"],
      required: true,
      index: true,
    },

    visitType: {
      type: String,
      enum: ["consultation", "follow-up", "review", "emergency"],
      default: "consultation",
      index: true,
    },

    workflowStatus: {
      type: String,
      enum: [
        "checked-in",
        "triage",
        "waiting",
        "in-progress",
        "completed",
        "cancelled",
        "no-show",
      ],
      default: "checked-in",
      index: true,
    },

    priority: {
      type: String,
      enum: ["normal", "urgent", "emergency"],
      default: "normal",
      index: true,
    },

    chiefComplaint: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    triageNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },

    vitals: {
      temperature: { type: Number, default: null },
      pulse: { type: Number, default: null },
      bloodPressure: { type: String, trim: true, default: null },
      respiratoryRate: { type: Number, default: null },
      spo2: { type: Number, default: null },
      weight: { type: Number, default: null },
      height: { type: Number, default: null },
    },

    checkedInAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    triagedAt: {
      type: Date,
      default: null,
      index: true,
    },

    startedAt: {
      type: Date,
      default: null,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
      index: true,
    },

    checkedInBy: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    triagedBy: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    startedBy: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    completedBy: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

visitQueueSchema.pre("save", function () {
  if (this.completedAt && this.startedAt && this.completedAt < this.startedAt) {
    throw new Error("completedAt cannot be earlier than startedAt");
  }

  if (this.triagedAt && this.checkedInAt && this.triagedAt < this.checkedInAt) {
    throw new Error("triagedAt cannot be earlier than checkedInAt");
  }
});

visitQueueSchema.index({ organizationId: 1, createdAt: -1 });
visitQueueSchema.index({ organizationId: 1, workflowStatus: 1, checkedInAt: 1 });
visitQueueSchema.index({ providerId: 1, workflowStatus: 1, checkedInAt: 1 });
visitQueueSchema.index({ appointmentId: 1 }, { unique: true, sparse: true });

export const VisitQueue = mongoose.model("VisitQueue", visitQueueSchema);