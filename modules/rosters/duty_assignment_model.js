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

// --- New enum: check-in verification method ---
const CHECK_IN_METHODS = ["standard", "qr", "nfc", "geofence"];

// Grace period before a check-in is marked "late" instead of "checked-in".
// Kept as a named constant rather than a magic number since it'll likely
// become a per-organization setting later.
export const LATE_GRACE_MINUTES = 15;

// --- Fields to add inside dutyAssignmentSchema, alongside the existing
//     status/backupStaffId/cancelReason/notes fields ---
const checkInOutFieldsToAdd = {
  checkedInAt: {
    type: Date,
    default: null,
  },

  checkInMethod: {
    type: String,
    enum: CHECK_IN_METHODS,
    default: null,
  },

  // Only populated when checkInMethod is "geofence". Not required even
  // then — geofence is a supplement, not the sole verification method
  // (see spec: don't rely exclusively on GPS).
  checkInLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },

  // Set only when checkInMethod is "qr" — the code payload scanned,
  // for audit purposes. Not validated against a known-facility list
  // yet; that's a phase-3+ concern once QR codes are actually issued
  // per location.
  checkInQrCode: {
    type: String,
    default: null,
  },

  checkedOutAt: {
    type: Date,
    default: null,
  },

  // Minutes late at check-in, beyond LATE_GRACE_MINUTES. 0 if on time
  // or early. Null until checked in.
  lateByMinutes: {
    type: Number,
    default: null,
  },

  // Minutes worked beyond scheduled endTime. 0 if checked out on time
  // or early. Null until checked out.
  overtimeMinutes: {
    type: Number,
    default: null,
  },

  // Set true if the assignment's scheduled window has fully passed
  // (date + endTime) with checkedInAt set but checkedOutAt still null.
  // A background job should set this — not computed at read time here,
  // since "has the window passed" depends on the current time, not
  // just the stored document. See phase-3 notification worker.
  missedCheckOut: {
    type: Boolean,
    default: false,
  },
};

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

    ...checkInOutFieldsToAdd,
  },
  { timestamps: true },
);

dutyAssignmentSchema.index({ organizationId: 1, date: 1, staffId: 1 });
dutyAssignmentSchema.index({ rosterId: 1 });

export const STAFF_ROLE_TYPES = STAFF_ROLES;
export const DUTY_TYPE_VALUES = DUTY_TYPES;
export const ASSIGNMENT_STATUSES = ASSIGNMENT_STATUS;
export const CHECK_IN_METHOD_VALUES = CHECK_IN_METHODS;
export { checkInOutFieldsToAdd };
export const dutyAssignmentModel = mongoose.model("DutyAssignment", dutyAssignmentSchema);
