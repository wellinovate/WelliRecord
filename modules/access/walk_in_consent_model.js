import mongoose from "mongoose";
const { Schema } = mongoose;

const newPatientSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
    dateOfBirth: { type: String, default: null },
    state: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const walkInConsentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
    // null when the number has no WelliRecord. Kept so the response looks identical.
    patientId: { type: Schema.Types.ObjectId, default: null, index: true },
    // Set only when the provider is registering a patient who has no WelliRecord yet.
    newPatient: { type: newPatientSchema, default: null },
    categories: { type: [String], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WalkInConsent = mongoose.model("WalkInConsent", walkInConsentSchema);
