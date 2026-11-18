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

// ---------- senior review, patient note, release ----------
export const ISSUE_TYPES = ["sample_quality", "recollection_needed", "preparation", "other"];

// An entered and verified result waits for a senior's decision.
export const canReview = (order) => order?.status === "verified" && order?.approval?.status !== "approved";

// The person who entered or verified a result cannot approve it.
export const reviewerConflict = (order, reviewerId) => {
  const id = String(reviewerId || "");
  if (!id) return false;
  return [order?.enteredBy, order?.verifiedByUserId].some((x) => x && String(x) === id);
};

// Release to the patient needs an approval and happens once.
export const canRelease = (order) => order?.status === "verified" && order?.approval?.status === "approved" && !order?.transmittedAt;

// The note can change until the result is released.
export const canEditPatientNote = (order) => ["requested", "collected", "received", "processing", "quality-control", "verified"].includes(order?.status);

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const cleanReview = (input) => {
  const errors = [];
  const decision = input?.decision;
  const comment = clean(input?.comment, 1000);
  if (!["approve", "return"].includes(decision)) errors.push("Choose approve or return.");
  if (decision === "return" && comment.length < 5) errors.push("Say what needs correcting.");
  return { value: { decision, comment }, errors };
};

export const cleanPatientNote = (input) => {
  const errors = [];
  const text = clean(input?.text, 600);
  const issueType = input?.issueType || "other";
  if (!ISSUE_TYPES.includes(issueType)) errors.push("Choose a type for the note.");
  if (typeof input?.text === "string" && input.text.trim().length > 600) errors.push("Keep the note to 600 characters.");
  return { value: { text, issueType }, errors };
};

const FLAG_TO_INTERPRETATION = { H: "high", L: "low", HH: "critical", LL: "critical", A: "abnormal", N: "normal" };
const PREFIXED_TESTS = new Set(["urinalysis", "semen", "stool_re"]);

// One patient record per result row, so the vault can show trends. Numeric rows keep the plain
// analyte name; text and choice rows, and tests whose names would collide, carry the test name.
export const buildPatientRecords = (order) => {
  const note = order?.patientNote?.text ? `Note from the laboratory: ${order.patientNote.text}` : undefined;
  return (order?.results || []).map((r) => {
    const numeric = r.type === "numeric" || r.type === "calculated";
    const prefix = !numeric || PREFIXED_TESTS.has(order.testKey);
    const testName = (prefix ? `${order.testName}: ${r.name}` : r.name).slice(0, 250);
    const value = r.type === "sensitivity"
      ? (r.rows || []).map((x) => `${x.antibiotic} ${x.result}`).join("; ")
      : r.value == null ? "" : String(r.value);
    return {
      testName,
      category: order.category || "other",
      resultValue: value.slice(0, 200),
      unit: numeric ? r.unit || undefined : undefined,
      referenceRange: r.refText ? { text: String(r.refText).slice(0, 100) } : undefined,
      interpretation: r.type === "sensitivity" ? "unknown" : FLAG_TO_INTERPRETATION[r.flag] || "unknown",
      notes: note,
    };
  });
};
