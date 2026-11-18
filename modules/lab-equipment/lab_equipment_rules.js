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

// ---------- automatic stock deduction ----------
// lots: reagents with the same name. Takes from the earliest-expiring lot first and skips expired lots.
// Returns the amount to take from each lot and any shortfall. Nothing is taken beyond what is in stock.
export const planDeduction = (lots, qty, now = new Date()) => {
  const usable = (lots || [])
    .filter((l) => (l.quantity ?? 0) > 0 && !(l.expiresOn && new Date(l.expiresOn).getTime() < startOfDay(now)))
    .sort((a, b) => (a.expiresOn ? new Date(a.expiresOn).getTime() : Infinity) - (b.expiresOn ? new Date(b.expiresOn).getTime() : Infinity));
  let left = qty;
  const allocations = [];
  for (const l of usable) {
    if (left <= 1e-9) break;
    const take = Math.min(l.quantity, left);
    allocations.push({ reagentId: l._id, take: Math.round(take * 1e6) / 1e6 });
    left -= take;
  }
  return { allocations, shortfall: left > 1e-9 ? Math.round(left * 1e6) / 1e6 : 0 };
};

export const cleanUsage = (input) => {
  const errors = [];
  const testKey = str(input?.testKey, 60);
  const reagentName = str(input?.reagentName, 120);
  const quantityPerRun = Number(input?.quantityPerRun);
  if (!testKey) errors.push("Choose a test.");
  if (!reagentName) errors.push("Choose a reagent.");
  if (!(Number.isFinite(quantityPerRun) && quantityPerRun > 0 && quantityPerRun <= 1e4)) errors.push("Amount per test must be more than zero.");
  return { value: { testKey, reagentName, quantityPerRun, note: str(input?.note, 200) }, errors };
};

// ---------- instrument results ----------
// Instrument code to result field code. map: [{instrumentCode, analyteCode}]
export const cleanCodeMap = (map) => {
  const errors = [];
  if (!Array.isArray(map)) return { value: [], errors: ["Code map must be a list."] };
  if (map.length > 300) return { value: [], errors: ["Too many mappings."] };
  const seen = new Set();
  const value = [];
  for (const m of map) {
    const instrumentCode = str(m?.instrumentCode, 40);
    const analyteCode = str(m?.analyteCode, 40);
    if (!instrumentCode || !analyteCode) { errors.push("Each mapping needs both codes."); continue; }
    if (seen.has(instrumentCode.toUpperCase())) { errors.push(`${instrumentCode} is mapped twice.`); continue; }
    seen.add(instrumentCode.toUpperCase());
    value.push({ instrumentCode, analyteCode, unit: str(m?.unit, 30) });
  }
  return { value, errors };
};

// HL7 v2 ORU^R01. Reads the sample id (OBR-3, else OBR-2) and numeric or text observations (OBX).
// Only final or corrected results are kept. Returns { barcode, observations, errors }.
export const parseHl7Oru = (text) => {
  const errors = [];
  if (typeof text !== "string" || !text.startsWith("MSH") || text.length > 200000) return { barcode: "", observations: [], errors: ["Not an HL7 message."] };
  const fieldSep = text[3];
  const segs = text.split(/\r\n|\r|\n/).filter(Boolean);
  const msh = segs[0].split(fieldSep);
  const msgType = (msh[8] || "").split(msh[1]?.[0] || "^")[0];
  if (msgType && msgType !== "ORU") errors.push("Only ORU result messages are accepted.");
  const comp = (msh[1] || "^~\\&")[0];
  let barcode = "";
  const observations = [];
  for (const seg of segs.slice(1)) {
    const f = seg.split(fieldSep);
    if (f[0] === "OBR" && !barcode) barcode = (f[3] || f[2] || "").split(comp)[0].trim();
    if (f[0] === "OBX") {
      const type = (f[2] || "").trim();
      const code = (f[3] || "").split(comp)[0].trim();
      const status = (f[11] || "F").trim();
      if (!code || !["NM", "ST", "SN", "TX", "CE"].includes(type) || !["F", "C", ""].includes(status)) continue;
      let value = (f[5] || "").trim();
      if (type === "SN") value = value.split(comp).slice(-1)[0];
      if (type === "CE") value = value.split(comp)[1] || value.split(comp)[0];
      if (value === "") continue;
      observations.push({ code, value, unit: (f[6] || "").split(comp)[0].trim() });
    }
  }
  if (!barcode) errors.push("No sample id in the message.");
  if (!observations.length) errors.push("No results in the message.");
  return { barcode, observations, errors };
};

// Maps instrument codes to the order's result fields. Unknown codes are returned, not guessed.
export const mapInstrumentResults = (observations, codeMap, analyteCodes) => {
  const by = new Map((codeMap || []).map((m) => [m.instrumentCode.toUpperCase(), m]));
  const entries = [];
  const unmapped = [];
  const allowed = new Set(analyteCodes);
  for (const o of observations || []) {
    const m = by.get(String(o.code).toUpperCase());
    if (!m || !allowed.has(m.analyteCode)) { unmapped.push(o.code); continue; }
    // The unit set in the mapping wins: instruments write units like 10*9/L that the catalog does not use.
    const unit = m.unit || o.unit;
    entries.push({ code: m.analyteCode, value: String(o.value), ...(unit ? { unit } : {}) });
  }
  return { entries, unmapped };
};

// What needs attention in a lab's register: reagents that are empty, low, expired or expiring,
// and analysers whose calibration is overdue or due soon. `signature` changes only when the list does.
export const buildStockDigest = (reagents = [], analyzers = [], now = new Date()) => {
  const items = [];
  for (const r of reagents) {
    if (r.isActive === false) continue;
    const s = reagentStatus(r, now);
    if (s === "ok") continue;
    const unit = r.unit ? ` ${r.unit}` : "";
    const text = {
      expired: `${r.name} (lot ${r.lotNumber || "-"}) has expired`,
      empty: `${r.name} (lot ${r.lotNumber || "-"}) is finished`,
      low: `${r.name} is low: ${r.quantity}${unit} left, reorder level ${r.reorderLevel}`,
      expiring: `${r.name} (lot ${r.lotNumber || "-"}) expires soon`,
    }[s];
    items.push({ key: `r:${r._id}:${s}`, kind: "reagent", status: s, text });
  }
  for (const a of analyzers) {
    if (a.isActive === false) continue;
    const s = calibrationStatus(a, now);
    if (s !== "overdue" && s !== "due_soon") continue;
    items.push({ key: `a:${a._id}:${s}`, kind: "analyzer", status: s, text: `${a.name}: calibration ${s === "overdue" ? "is overdue" : "is due soon"}` });
  }
  const urgent = items.filter((i) => ["empty", "expired", "overdue"].includes(i.status)).length;
  return { items, urgent, signature: items.map((i) => i.key).sort().join("|") };
};

// Send when the list is new or has changed, or as a weekly reminder while it stays the same.
export const shouldSendDigest = (digest, last, now = new Date()) => {
  if (!digest.items.length) return false;
  if (!last) return true;
  if (last.signature !== digest.signature) return true;
  return now.getTime() - new Date(last.sentAt).getTime() >= 7 * DAY;
};
