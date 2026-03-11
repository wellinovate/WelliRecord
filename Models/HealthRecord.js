import mongoose from "mongoose";

const HealthRecordSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    date: { type: Date, required: true },
    type: {
      type: String,
      enum: ["Lab Result", "Prescription", "Imaging", "Clinical Note"],
      required: true,
    },
    provider: { type: String, required: true },
    summary: { type: String },
    status: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true },
);

export default mongoose.model("HealthRecord", HealthRecordSchema);
