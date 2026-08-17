import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const WORKFLOW_STAGES = [
  "requested",
  "scheduled",
  "in-progress",
  "images-uploaded",
  "reported",
  "delivered",
];

const MODALITIES = [
  "x-ray",
  "ultrasound",
  "ct",
  "mri",
  "mammography",
  "fluoroscopy",
  "other",
];

// One uploaded image/scan file per entry. DICOM (.dcm) files are stored
// as-is (resourceType "raw") — Cloudinary can host them but cannot
// render a preview for them without a DICOM viewer, which is a
// separate piece of work. Standard exported images (JPEG/PNG, which is
// what most of the pilot facilities' machines actually output) upload
// as resourceType "image" and get a real inline preview.
const imageSubSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
    originalFilename: { type: String, trim: true, default: null },
    format: { type: String, trim: true, default: null },
    bytes: { type: Number, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const radiologyOrderSchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "lab", "imported"],
      default: "provider",
    },

    examName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    modality: {
      type: String,
      enum: MODALITIES,
      default: "other",
      index: true,
    },

    bodyPart: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    status: {
      type: String,
      enum: WORKFLOW_STAGES,
      default: "requested",
      index: true,
    },

    priority: {
      type: String,
      enum: ["routine", "urgent"],
      default: "routine",
      index: true,
    },

    clinicalIndication: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    doctorName: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    doctorPhone: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "pending"],
      default: "pending",
    },

    isCritical: {
      type: Boolean,
      default: false,
      index: true,
    },

    images: {
      type: [imageSubSchema],
      default: [],
    },

    report: {
      findings: { type: String, trim: true, maxlength: 5000, default: null },
      impression: { type: String, trim: true, maxlength: 2000, default: null },
      radiologistName: { type: String, trim: true, maxlength: 200, default: null },
      reportedBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
      reportedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

radiologyOrderSchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "lab", "imported"],
  defaultSource: "provider",
  defaultCreatedContext: "facility-chart",
  providerOwnedSources: ["provider", "lab"],
});

radiologyOrderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const RADIOLOGY_ORDER_WORKFLOW_STAGES = WORKFLOW_STAGES;
export const RADIOLOGY_ORDER_MODALITIES = MODALITIES;
export const radiologyOrderModel = mongoose.model("RadiologyOrder", radiologyOrderSchema);
