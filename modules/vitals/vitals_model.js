import mongoose from "mongoose";
import {
  clinicalMetadataFields,
  clinicalMetadataPlugin,
} from "../../shared/database/clinical_metadata.js";

const { Schema } = mongoose;

const vitalEntrySchema = new Schema(
  {
    ...clinicalMetadataFields,

    source: {
      ...clinicalMetadataFields.source,
      enum: ["patient", "provider", "device", "imported"],
      default: "patient",
    },

    bloodPressure: {
      systolic: {
        type: Number,
        min: 0,
      },
      diastolic: {
        type: Number,
        min: 0,
      },
    },

    heartRate: {
      type: Number,
      min: 0,
    },

    temperature: {
      value: {
        type: Number,
      },
      unit: {
        type: String,
        enum: ["C", "F"],
        default: "C",
      },
    },

    respiratoryRate: {
      type: Number,
      min: 0,
    },

    oxygenSaturation: {
      type: Number,
      min: 0,
      max: 100,
    },

    weight: {
      value: {
        type: Number,
        min: 0,
      },
      unit: {
        type: String,
        enum: ["kg", "lb"],
        default: "kg",
      },
    },

    height: {
      value: {
        type: Number,
        min: 0,
      },
      unit: {
        type: String,
        enum: ["cm", "m", "ft", "in"],
        default: "cm",
      },
    },

    bmi: {
      type: Number,
      min: 0,
    },

    bloodGlucose: {
      value: {
        type: Number,
        min: 0,
      },
      unit: {
        type: String,
        enum: ["mg/dL", "mmol/L"],
        default: "mg/dL",
      },
      fasting: {
        type: Boolean,
        default: false,
      },
    },

    measuredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    clinicalStatus: {
      type: String,
      enum: ["active", "entered-in-error"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

vitalEntrySchema.plugin(clinicalMetadataPlugin, {
  allowedSources: ["patient", "provider", "device", "imported"],
  defaultSource: "patient",
  defaultCreatedContext: "patient-app",
  providerOwnedSources: ["provider"],
});

vitalEntrySchema.pre("save", function (next) {
  try {
    let weightKg = null;
    let heightM = null;

    if (this.weight?.value) {
      if (this.weight.unit === "kg") weightKg = this.weight.value;
      if (this.weight.unit === "lb") weightKg = this.weight.value * 0.453592;
    }

    if (this.height?.value) {
      if (this.height.unit === "m") heightM = this.height.value;
      if (this.height.unit === "cm") heightM = this.height.value / 100;
      if (this.height.unit === "ft") heightM = this.height.value * 0.3048;
      if (this.height.unit === "in") heightM = this.height.value * 0.0254;
    }

    if (weightKg && heightM && heightM > 0) {
      this.bmi = Number((weightKg / (heightM * heightM)).toFixed(2));
    }

    next();
  } catch (error) {
    next(error);
  }
});

vitalEntrySchema.index({ patientId: 1, measuredAt: -1 });

export const vitalModel = mongoose.model("Vital", vitalEntrySchema);