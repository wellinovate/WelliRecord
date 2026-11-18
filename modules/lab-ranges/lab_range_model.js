import mongoose from "mongoose";

const { Schema } = mongoose;

const rangeSchema = new Schema(
  {
    sex: { type: String, enum: ["any", "M", "F"], default: "any" },
    ageMin: Number, ageMax: Number, low: Number, high: Number, critLow: Number, critHigh: Number, text: String,
  },
  { _id: false },
);

const schema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    testKey: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    ranges: { type: [rangeSchema], default: [] },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);
schema.index({ organizationId: 1, testKey: 1, code: 1 }, { unique: true });

export const LabRangeOverride = mongoose.models.LabRangeOverride || mongoose.model("LabRangeOverride", schema);
