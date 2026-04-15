import mongoose from "mongoose";

const Schema = mongoose.Schema;
const ObjectId = mongoose.Schema.Types.ObjectId;

const appointmentSchema = new Schema(
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

    providerId: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },

    reasonForVisit: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    status: {
      type: String,
      enum: ["booked", "checked-in", "cancelled", "no-show", "completed"],
      default: "booked",
      index: true,
    },

    createdBy: {
      type: ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

appointmentSchema.pre("save", function () {
  if (this.scheduledFor && Number.isNaN(new Date(this.scheduledFor).getTime())) {
    throw new Error("Invalid scheduledFor date");
  }
});

appointmentSchema.index({ organizationId: 1, scheduledFor: 1, status: 1 });
appointmentSchema.index({ patientId: 1, scheduledFor: -1 });
appointmentSchema.index({ providerId: 1, scheduledFor: 1, status: 1 });

export const Appointment = mongoose.model("Appointment", appointmentSchema);