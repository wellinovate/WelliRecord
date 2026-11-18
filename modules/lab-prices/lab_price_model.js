import mongoose from "mongoose";

const { Schema } = mongoose;
const schema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    key: { type: String, required: true },
    testKey: { type: String, default: "" },
    testName: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true },
);
schema.index({ organizationId: 1, key: 1 }, { unique: true });
export const LabPrice = mongoose.models.LabPrice || mongoose.model("LabPrice", schema);
