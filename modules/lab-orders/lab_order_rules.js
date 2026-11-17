// Pure rules for lab order stages. No database, so it can be unit tested.
import crypto from "crypto";

export const STAGES = [
  "requested",
  "collected",
  "received",
  "processing",
  "quality-control",
  "verified",
  "released",
  "delivered",
  "rejected",
  "cancelled",
];

// Allowed moves through the status route. A stage cannot be skipped or reversed,
// except quality-control back to processing (repeat the run).
// "verified" is not here: it is reached only through the verify step.
export const TRANSITIONS = {
  requested: ["collected", "rejected", "cancelled"],
  collected: ["received", "rejected", "cancelled"],
  received: ["processing", "rejected"],
  processing: ["quality-control", "rejected"],
  "quality-control": ["processing", "rejected"],
  verified: ["released"],
  released: ["delivered"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

// A result can be entered while the sample is being run or checked.
export const canEnterResult = (status) => status === "processing" || status === "quality-control";

// Verification applies to an entered result that is waiting in quality-control.
export const canVerify = (order) => order?.status === "quality-control" && Boolean(order?.measuredValue);

export const isSelfVerified = (enteredBy, verifierId) =>
  Boolean(enteredBy) && Boolean(verifierId) && String(enteredBy) === String(verifierId);

// Random, not time based, so two orders in the same millisecond cannot share a barcode.
export const generateBarcode = () => `LB-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
