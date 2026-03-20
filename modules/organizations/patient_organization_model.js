import mongoose from "mongoose";
const { Schema } = mongoose;

const patientOrganizationSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: false,
      index: true,
    },
    patientIdentity: {
      type: Schema.Types.ObjectId,
      ref: "PatientIdentity",
      required: false,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Account", // organization account
      required: true,
      index: true,
    },

    // 🔥 How patient relates to this org
    relationshipType: {
      type: String,
      enum: [
        "registered",     // patient registered at facility
        "visited",        // had encounter
        "admitted",       // inpatient
        "referred",       // referred here
        "primary-care",   // main hospital
      ],
      default: "visited",
      index: true,
    },

    // 🔥 Status of relationship
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
      index: true,
    },

    // 🔥 Local hospital patient ID (VERY IMPORTANT)
    externalPatientId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    // 🔥 When first seen
    firstSeenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // 🔥 Last interaction
    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicates
patientOrganizationSchema.index(
  { patientId: 1, organizationId: 1 },
  { unique: true }
);

export const PatientOrganization = mongoose.model(
  "PatientOrganization",
  patientOrganizationSchema
);