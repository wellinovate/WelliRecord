import mongoose from "mongoose";

const { Schema } = mongoose;

const STAFF_ROLES = [
  "doctor",
  "nurse",
  "pharmacist",
  "laboratory-scientist",
  "laboratory-technician",
  "radiographer",
  "optometrist",
  "admin",
  "driver",
  "other",
];

const DUTY_TYPES = [
  "regular",
  "day-call",
  "night-call",
  "weekend",
  "public-holiday",
  "emergency-on-call",
  "standby",
  "leave",
  "off-duty",
];

// Full status set is modeled now so phase 2 (check-in/check-out) doesn't
// require a migration. Phase 1 service logic only sets/reads "scheduled"
// and "cancelled" — checked-in/late/absent/completed are wired up when
// e-check-in lands.
const ASSIGNMENT_STATUS = [
  "scheduled",
  "checked-in",
  "late",
  "absent",
  "completed",
  "cancelled",
];

const dutyAssignmentSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      required: true,
      index: true,
    },

    rosterId: {
      type: Schema.Types.ObjectId,
      ref: "Roster",
      required: true,
      index: true,
    },

    staffId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    staffRole: {
      type: String,
      enum: STAFF_ROLES,
      required: true,
    },

    duty: {
      type: String,
      enum: DUTY_TYPES,
      required: true,
      index: true,
    },

    // Free text on purpose — location sets differ by organization type
    // (hospital vs diagnostic center vs pharmacy). If per-org location
    // lists become a hard requirement, this becomes a ref into a
    // Location collection instead.
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String, // "HH:MM", 24-hour
      required: true,
    },

    endTime: {
      type: String, // "HH:MM", 24-hour — may roll past midnight
      required: true,
    },

    status: {
      type: String,
      enum: ASSIGNMENT_STATUS,
      default: "scheduled",
      index: true,
    },

    backupStaffId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
    },

    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true },
);

dutyAssignmentSchema.index({ organizationId: 1, date: 1, staffId: 1 });
dutyAssignmentSchema.index({ rosterId: 1 });

export const STAFF_ROLE_TYPES = STAFF_ROLES;
export const DUTY_TYPE_VALUES = DUTY_TYPES;
export const ASSIGNMENT_STATUSES = ASSIGNMENT_STATUS;
export const dutyAssignmentModel = mongoose.model("DutyAssignment", dutyAssignmentSchema);
