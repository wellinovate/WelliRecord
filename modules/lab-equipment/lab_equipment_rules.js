// Rules for the analyzer register and reagent stock. No database here.
const DAY = 86400000;
export const DUE_SOON_DAYS = 14;
export const EXPIRING_DAYS = 30;

export const ANALYZER_STATUSES = ["active", "maintenance", "out_of_service"];
export const EVENT_TYPES = ["calibration", "qc", "maintenance", "note"];
export const MOVEMENT_REASONS = ["received", "used", "wasted", "adjustment"];

const days = (from, to) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY);

// When the next calibration is due, from the last one and the interval the lab set.
// No last calibration or no interval means the register cannot say.
export const nextCalibrationDue = (a) => {
  if (!a?.lastCalibrationAt || !a?.calibrationIntervalDays) return null;
  return new Date(new Date(a.lastCalibrationAt).getTime() + a.calibrationIntervalDays * DAY);
};

// ok | due_soon | overdue | unknown (no calibration date or interval on record)
export const calibrationStatus = (a, now = new Date()) => {
  const due = nextCalibrationDue(a);
  if (!due) return "unknown";
  const left = Math.ceil((due.getTime() - now.getTime()) / DAY);
  if (left < 0) return "overdue";
  return left <= DUE_SOON_DAYS ? "due_soon" : "ok";
};

// expired | expiring | empty | low | ok. Expired wins, then empty, then low.
export const reagentStatus = (r, now = new Date()) => {
  if (r?.expiresOn && new Date(r.expiresOn).getTime() < startOfDay(now)) return "expired";
  if ((r?.quantity ?? 0) <= 0) return "empty";
  if (r?.reorderLevel != null && r.quantity <= r.reorderLevel) return "low";
  if (r?.expiresOn && days(now, r.expiresOn) <= EXPIRING_DAYS) return "expiring";
  return "ok";
};
const startOfDay = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x.getTime(); };

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v) => { if (v === "" || v == null) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; };

// Cleans analyzer input. Returns { value, errors }.
export const cleanAnalyzer = (input, { partial = false } = {}) => {
  const errors = [];
  const out = {};
  const set = (k, v) => { if (!partial || input[k] !== undefined) out[k] = v; };
  const name = str(input.name, 120);
  if (!partial || input.name !== undefined) { if (!name) errors.push("Name is required."); set("name", name); }
  for (const [k, n] of [["manufacturer", 100], ["model", 100], ["serialNumber", 100], ["department", 60], ["location", 100], ["notes", 500]]) set(k, str(input[k], n));
  if (input.status !== undefined) { if (!ANALYZER_STATUSES.includes(input.status)) errors.push("Status must be active, maintenance or out_of_service."); else out.status = input.status; }
  for (const k of ["installedOn", "lastCalibrationAt"]) {
    if (input[k] !== undefined) { const d = date(input[k]); if (d === undefined) errors.push(`${k} is not a valid date.`); else if (d && d.getTime() > Date.now() + DAY) errors.push(`${k} cannot be in the future.`); else out[k] = d; }
  }
  if (input.calibrationIntervalDays !== undefined) {
    const n = input.calibrationIntervalDays === "" || input.calibrationIntervalDays == null ? null : Number(input.calibrationIntervalDays);
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 730)) errors.push("Calibration interval must be 1 to 730 days.");
    else out.calibrationIntervalDays = n;
  }
  return { value: out, errors };
};

export const cleanReagent = (input, { partial = false } = {}) => {
  const errors = [];
  const out = {};
  const name = str(input.name, 120);
  if (!partial || input.name !== undefined) { if (!name) errors.push("Name is required."); out.name = name; }
  for (const [k, n] of [["catalogNumber", 60], ["lotNumber", 60], ["supplier", 100], ["unit", 20], ["location", 100], ["notes", 500]]) if (!partial || input[k] !== undefined) out[k] = str(input[k], n);
  if (input.analyzerId !== undefined) out.analyzerId = input.analyzerId || null;
  for (const k of ["expiresOn", "receivedOn", "openedOn"]) {
    if (input[k] !== undefined) { const d = date(input[k]); if (d === undefined) errors.push(`${k} is not a valid date.`); else out[k] = d; }
  }
  if (input.reorderLevel !== undefined) {
    const n = input.reorderLevel === "" || input.reorderLevel == null ? null : Number(input.reorderLevel);
    if (n !== null && !(Number.isFinite(n) && n >= 0)) errors.push("Reorder level must be zero or more."); else out.reorderLevel = n;
  }
  return { value: out, errors };
};

// Stock change. Positive for received, negative for used or wasted. Adjustment can be either.
export const cleanMovement = (input) => {
  const errors = [];
  const reason = input?.reason;
  if (!MOVEMENT_REASONS.includes(reason)) errors.push("Reason must be received, used, wasted or adjustment.");
  const qty = Number(input?.quantity);
  if (!Number.isFinite(qty) || qty === 0) errors.push("Quantity must be a number other than zero.");
  if (Math.abs(qty) > 1e6) errors.push("Quantity is too large.");
  let change = qty;
  if (reason === "received") change = Math.abs(qty);
  if (reason === "used" || reason === "wasted") change = -Math.abs(qty);
  if (reason === "adjustment" && !str(input?.note, 300)) errors.push("Say why the stock is being adjusted.");
  return { value: { reason, change, note: str(input?.note, 300) }, errors };
};

export const cleanEvent = (input) => {
  const errors = [];
  if (!EVENT_TYPES.includes(input?.type)) errors.push("Type must be calibration, qc, maintenance or note.");
  let result = "";
  if (input?.type === "qc") { if (!["pass", "fail"].includes(input?.result)) errors.push("A QC entry needs pass or fail."); else result = input.result; }
  const on = input?.performedAt ? date(input.performedAt) : new Date();
  if (on === undefined || on === null) errors.push("Date is not valid.");
  else if (on.getTime() > Date.now() + DAY) errors.push("Date cannot be in the future.");
  return { value: { type: input?.type, result, performedAt: on, note: str(input?.note, 500), lotNumber: str(input?.lotNumber, 60) }, errors };
};
