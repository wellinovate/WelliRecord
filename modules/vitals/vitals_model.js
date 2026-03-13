import mongoose from "mongoose";
const Schema = mongoose.Schema;

const vitalEntrySchema = new Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // provider/admin who recorded it
      default: null,
    },

    source: {
      type: String,
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

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

// Optional: auto-calculate BMI if weight and height are in supported units
vitalEntrySchema.pre("save", function (next) {
  try {
    let weightKg = null;
    let heightM = null;

    if (this.weight?.value) {
      if (this.weight.unit === "kg") {
        weightKg = this.weight.value;
      } else if (this.weight.unit === "lb") {
        weightKg = this.weight.value * 0.453592;
      }
    }

    if (this.height?.value) {
      if (this.height.unit === "m") {
        heightM = this.height.value;
      } else if (this.height.unit === "cm") {
        heightM = this.height.value / 100;
      } else if (this.height.unit === "ft") {
        heightM = this.height.value * 0.3048;
      } else if (this.height.unit === "in") {
        heightM = this.height.value * 0.0254;
      }
    }

    if (weightKg && heightM && heightM > 0) {
      this.bmi = Number((weightKg / (heightM * heightM)).toFixed(2));
    }

    next();
  } catch (error) {
    next(error);
  }
});

export const vitalModel = mongoose.model("Vital", vitalEntrySchema);