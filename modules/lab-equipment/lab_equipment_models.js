import mongoose from "mongoose";

const { Schema } = mongoose;
const oid = { type: Schema.Types.ObjectId };

const analyzerSchema = new Schema(
  {
    organizationId: { ...oid, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    manufacturer: { type: String, default: "" },
    model: { type: String, default: "" },
    serialNumber: { type: String, default: "" },
    department: { type: String, default: "" },
    location: { type: String, default: "" },
    status: { type: String, enum: ["active", "maintenance", "out_of_service"], default: "active" },
    installedOn: Date,
    lastCalibrationAt: Date,
    calibrationIntervalDays: Number,
    lastQcAt: Date,
    lastQcResult: { type: String, enum: ["pass", "fail", ""], default: "" },
    notes: { type: String, default: "" },
    // Instrument import: how the machine's result codes map to result fields, and a key it posts with.
    codeMap: { type: [Schema.Types.Mixed], default: [] },
    ingestKeyHash: { type: String, default: "", select: false },
    ingestKeySetAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const eventSchema = new Schema(
  {
    organizationId: { ...oid, required: true, index: true },
    analyzerId: { ...oid, ref: "LabAnalyzer", required: true, index: true },
    type: { type: String, enum: ["calibration", "qc", "maintenance", "note"], required: true },
    result: { type: String, default: "" },
    performedAt: { type: Date, required: true },
    lotNumber: { type: String, default: "" },
    note: { type: String, default: "" },
    byName: { type: String, default: "" },
  },
  { timestamps: true },
);

const reagentSchema = new Schema(
  {
    organizationId: { ...oid, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    catalogNumber: { type: String, default: "" },
    lotNumber: { type: String, default: "" },
    supplier: { type: String, default: "" },
    analyzerId: { ...oid, ref: "LabAnalyzer", default: null },
    quantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: "" },
    reorderLevel: { type: Number, default: null },
    expiresOn: Date,
    receivedOn: Date,
    openedOn: Date,
    location: { type: String, default: "" },
    notes: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const movementSchema = new Schema(
  {
    organizationId: { ...oid, required: true, index: true },
    reagentId: { ...oid, ref: "LabReagent", required: true, index: true },
    reason: { type: String, enum: ["received", "used", "wasted", "adjustment"], required: true },
    change: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    note: { type: String, default: "" },
    byName: { type: String, default: "" },
    orderId: { ...oid, default: null },
  },
  { timestamps: true },
);

const usageSchema = new Schema(
  {
    organizationId: { ...oid, required: true, index: true },
    testKey: { type: String, required: true, trim: true },
    reagentName: { type: String, required: true, trim: true },
    quantityPerRun: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);
usageSchema.index({ organizationId: 1, testKey: 1, reagentName: 1 }, { unique: true });

export const LabReagentUsage = mongoose.models.LabReagentUsage || mongoose.model("LabReagentUsage", usageSchema);
export const LabAnalyzer = mongoose.models.LabAnalyzer || mongoose.model("LabAnalyzer", analyzerSchema);
export const LabAnalyzerEvent = mongoose.models.LabAnalyzerEvent || mongoose.model("LabAnalyzerEvent", eventSchema);
export const LabReagent = mongoose.models.LabReagent || mongoose.model("LabReagent", reagentSchema);
export const LabReagentMovement = mongoose.models.LabReagentMovement || mongoose.model("LabReagentMovement", movementSchema);
