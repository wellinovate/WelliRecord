import mongoose from "mongoose";

const { Schema } = mongoose;

const schema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "LabOrder", required: true, unique: true },
    patientId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true },
    patientName: { type: String, default: "" },
    testName: { type: String, default: "" },
    values: [{ _id: false, name: String, value: Schema.Types.Mixed, unit: String, flag: String }],
    enteredByName: { type: String, default: "" },
    doctorName: { type: String, default: "" },
    // Result of the automatic SMS to the requesting doctor.
    sms: { type: String, enum: ["not_attempted", "no_phone", "sent", "failed"], default: "not_attempted" },
    smsError: { type: String, default: "" },
    status: { type: String, enum: ["open", "acknowledged"], default: "open", index: true },
    // Who was told, and how. Filled in by a person, not by the system.
    notifiedTo: { type: String, trim: true, maxlength: 200, default: "" },
    method: { type: String, enum: ["phone", "sms", "in_person", "other", ""], default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    acknowledgedBy: { type: String, default: "" },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true },
);

export const LabCriticalAlert = mongoose.models.LabCriticalAlert || mongoose.model("LabCriticalAlert", schema);
