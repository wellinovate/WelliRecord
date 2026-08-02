import mongoose from "mongoose";

const { Schema } = mongoose;

// A single eye's refraction values for one visit.
const refractionSchema = new Schema(
  {
    sphere: { type: Number, default: null },
    cylinder: { type: Number, default: null },
    axis: { type: Number, default: null },
    add: { type: Number, default: null },
  },
  { _id: false },
);

// One provider-entered visit. Nothing in this sub-schema is ever written
// from a patient-facing route — see vision_record_service.js.
const visionVisitSchema = new Schema(
  {
    date: { type: Date, required: true, default: Date.now },

    clinicName: { type: String, required: true, trim: true },
    providerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    providerName: { type: String, required: true, trim: true },

    // Set at write time from the acting provider's organization (see
    // vision_record_service.js). Lets the org-wide provider list query
    // filter visits the same way getAllPatientMedicationsService does —
    // null only for visits entered before this field existed.
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "OrganizationProfile",
      default: null,
    },

    acuity: {
      distance: {
        right: { type: String, default: null }, // e.g. "6/6", "20/40"
        left: { type: String, default: null },
      },
      near: {
        right: { type: String, default: null },
        left: { type: String, default: null },
      },
    },

    colorVision: {
      type: String,
      enum: ["normal", "deficient", "not_tested"],
      default: "not_tested",
    },

    lensPrescription: {
      right: { type: refractionSchema, default: () => ({}) },
      left: { type: refractionSchema, default: () => ({}) },
    },

    diagnosis: { type: String, trim: true, default: "" },
    treatment: { type: String, trim: true, default: "" },

    // Non-DICOM only, per spec section 4. DICOM upload is out of scope
    // for this schema until a separate imaging pipeline exists.
    photos: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        caption: { type: String, default: "" },
      },
    ],

    // Provenance is mandatory on every visit, not optional metadata.
    // enteredBy always resolves to a provider account — the create
    // service rejects any request where the acting account's role is
    // not "provider" before this ever reaches the schema.
    provenance: {
      enteredBy: { type: Schema.Types.ObjectId, ref: "Account", required: true },
      enteredByRole: { type: String, enum: ["provider"], required: true },
      clinic: { type: String, required: true },
      enteredAt: { type: Date, required: true, default: Date.now },
      source: {
        type: String,
        enum: ["provider-entered"],
        required: true,
        default: "provider-entered",
      },
    },
  },
  { _id: true, timestamps: true },
);

const visionRecordSchema = new Schema(
  {
    // One VisionRecord doc per patient. Visits accumulate inside it —
    // this mirrors how allergy/immunization records already attach to
    // the patient rather than living in their own top-level collection
    // per entry.
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },

    visits: [visionVisitSchema],
  },
  { timestamps: true },
);

// Most-recent-first is the read pattern for both the provider history
// view and the patient profile section, so index supports that sort.
visionRecordSchema.index({ patientId: 1, "visits.date": -1 });
visionRecordSchema.index({ "visits.organizationId": 1, "visits.date": -1 });

export const visionRecordModel = mongoose.model("VisionRecord", visionRecordSchema);
