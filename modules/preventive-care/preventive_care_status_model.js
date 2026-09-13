import mongoose from "mongoose";

const { Schema } = mongoose;

// Tracks when a patient was last reminded about a given preventive-care
// item — not whether they actually did it, since no completion signal
// exists anywhere in this codebase. The sweep re-reminds on the same
// interval regardless of whether the prior reminder was acted on.
const preventiveCareStatusSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },
    careItemId: {
      type: String,
      required: true,
      index: true,
    },
    lastReminderSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

preventiveCareStatusSchema.index({ patientId: 1, careItemId: 1 }, { unique: true });

export const PreventiveCareStatus = mongoose.model(
  "PreventiveCareStatus",
  preventiveCareStatusSchema,
);
