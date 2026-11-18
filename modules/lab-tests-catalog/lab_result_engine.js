// Result engine for structured lab results. Pure functions, no database.
//
// A test definition lists analytes. An analyte is one measured result, for example haemoglobin.
//   type "numeric"     a number with a unit, reference ranges and critical limits
//   type "choice"      one of a fixed list (Negative / Positive, Reactive / Non-reactive, +, ++)
//   type "text"        free text (colour, microscopy comment)
//   type "calculated"  worked out here from other analytes; a value sent by the client is ignored
//   type "sensitivity" antibiotic susceptibility rows, each S, I, R or NT
//
// The engine picks the reference range for the patient's sex and age, sets the flag, marks
// critical values, converts alternate units, and computes derived values. Nothing here decides
// a diagnosis. Reference ranges are defaults that a lab must review and can override.

const DAY_MS = 86400000;

export const SENSITIVITY_RESULTS = ["S", "I", "R", "NT"];

export const patientContext = ({ gender, dateOfBirth } = {}, at = new Date()) => {
  const sex = gender === "Male" ? "M" : gender === "Female" ? "F" : null;
  let ageYears = null;
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (!Number.isNaN(dob.getTime()) && dob.getTime() <= at.getTime()) {
      ageYears = (at.getTime() - dob.getTime()) / (365.25 * DAY_MS);
    }
  }
  return { sex, ageYears };
};

const round = (n, dp) => {
  const f = 10 ** (dp ?? 2);
  return Math.round((n + Number.EPSILON) * f) / f;
};

// The most specific range that fits the patient: a sex-specific range beats "any", and a
// narrower age window beats a wider one. No match means no range for this patient.
export const pickRange = (analyte, ctx = {}) => {
  const ranges = analyte.ranges || [];
  let best = null;
  let bestScore = -1;
  for (const r of ranges) {
    const sex = r.sex || "any";
    if (sex !== "any" && sex !== ctx.sex) continue;
    const ageMin = r.ageMin ?? 0;
    const ageMax = r.ageMax ?? 200;
    if (ctx.ageYears == null) {
      // Age unknown: only a range that covers all ages can be used.
      if (ageMin > 0 || ageMax < 200) continue;
    } else if (ctx.ageYears < ageMin || ctx.ageYears >= ageMax) {
      continue;
    }
    const score = (sex !== "any" ? 1000 : 0) + (1000 - Math.min(1000, ageMax - ageMin));
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
};

export const rangeText = (range, unit) => {
  if (!range) return "";
  if (range.text) return range.text;
  const u = unit ? ` ${unit}` : "";
  if (range.low != null && range.high != null) return `${range.low} - ${range.high}${u}`;
  if (range.low != null) return `> ${range.low}${u}`;
  if (range.high != null) return `< ${range.high}${u}`;
  return "";
};

// flag: "L" or "H" outside the range, "LL" or "HH" beyond a critical limit, "N" inside, null when there is no range.
export const evaluateNumeric = (value, range) => {
  if (!range) return { flag: null, critical: false };
  if (range.critLow != null && value < range.critLow) return { flag: "LL", critical: true };
  if (range.critHigh != null && value > range.critHigh) return { flag: "HH", critical: true };
  if (range.low != null && value < range.low) return { flag: "L", critical: false };
  if (range.high != null && value > range.high) return { flag: "H", critical: false };
  if (range.low == null && range.high == null) return { flag: null, critical: false };
  return { flag: "N", critical: false };
};

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Derived values. Each returns a number or null when an input is missing or the formula does not apply.
export const FORMULAS = {
  // Red cell indices. PCV in %, RBC in x10^12/L, Hb in g/dL.
  mcv: (v) => (num(v.pcv) != null && num(v.rbc) ? (v.pcv * 10) / v.rbc : null),
  mch: (v) => (num(v.hb) != null && num(v.rbc) ? (v.hb * 10) / v.rbc : null),
  mchc: (v) => (num(v.hb) != null && num(v.pcv) ? (v.hb / v.pcv) * 100 : null),
  // Lipids in mg/dL. Friedewald is not valid when triglycerides are 400 mg/dL or more.
  vldl: (v) => (num(v.tg) != null ? v.tg / 5 : null),
  ldl: (v) =>
    num(v.tc) != null && num(v.hdl) != null && num(v.tg) != null && v.tg < 400 ? v.tc - v.hdl - v.tg / 5 : null,
  non_hdl: (v) => (num(v.tc) != null && num(v.hdl) != null ? v.tc - v.hdl : null),
  tc_hdl_ratio: (v) => (num(v.tc) != null && num(v.hdl) ? v.tc / v.hdl : null),
  // Liver profile.
  indirect_bili: (v) => (num(v.tbil) != null && num(v.dbil) != null ? Math.max(0, v.tbil - v.dbil) : null),
  globulin: (v) => (num(v.tp) != null && num(v.alb) != null ? v.tp - v.alb : null),
  ag_ratio: (v) => (num(v.tp) != null && num(v.alb) != null && v.tp - v.alb > 0 ? v.alb / (v.tp - v.alb) : null),
  // Electrolytes in mmol/L.
  anion_gap: (v) => (num(v.na) != null && num(v.cl) != null && num(v.hco3) != null ? v.na - (v.cl + v.hco3) : null),
  // CKD-EPI 2021 (race-free). Creatinine in mg/dL. Adults only, so it is blank under 18 years.
  egfr: (v, ctx) => {
    const scr = v.creat;
    if (num(scr) == null || scr <= 0 || ctx.ageYears == null || ctx.ageYears < 18 || !ctx.sex) return null;
    const female = ctx.sex === "F";
    const kappa = female ? 0.7 : 0.9;
    const alpha = female ? -0.241 : -0.302;
    const ratio = scr / kappa;
    const e = 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** ctx.ageYears * (female ? 1.012 : 1);
    return e;
  },
};

// Entry value for one analyte, checked against its type.
const parseNumeric = (analyte, raw, unit) => {
  const text = typeof raw === "string" ? raw.trim().replace(/,/g, "") : raw;
  if (text === "" || text == null) return { skip: true };
  const n = typeof text === "number" ? text : Number(text);
  if (!Number.isFinite(n)) return { error: `${analyte.name}: enter a number.` };
  let value = n;
  if (unit && unit !== analyte.unit) {
    const alt = (analyte.altUnits || []).find((a) => a.unit === unit);
    if (!alt) return { error: `${analyte.name}: unit ${unit} is not supported.` };
    value = n * alt.factor;
  }
  const min = analyte.min ?? 0;
  const max = analyte.max ?? 1e9;
  if (value < min || value > max) {
    return { error: `${analyte.name}: ${n}${unit && unit !== analyte.unit ? " " + unit : ""} is outside the possible range. Check the value and unit.` };
  }
  return { value: round(value, analyte.dp ?? 2) };
};

/**
 * Turn submitted entries into stored result rows.
 * @param testDef     { analytes: [...] }
 * @param entries     [{ code, value, unit?, rows? }]  (rows is for sensitivity analytes)
 * @param ctx         patient context from patientContext()
 * @returns { results, isCritical, errors }
 */
export const processResults = (testDef, entries, ctx = {}) => {
  const analytes = testDef?.analytes || [];
  const byCode = new Map(analytes.map((a) => [a.code, a]));
  const errors = [];
  const entered = new Map();

  for (const e of entries || []) {
    if (!byCode.has(e?.code)) {
      errors.push(`Unknown result field: ${String(e?.code).slice(0, 40)}`);
      continue;
    }
    entered.set(e.code, e);
  }

  // First pass: values the person entered.
  const values = {};
  const rows = new Map();
  for (const a of analytes) {
    if (a.type === "calculated") continue;
    const e = entered.get(a.code);
    if (!e) continue;

    if (a.type === "numeric") {
      const p = parseNumeric(a, e.value, e.unit);
      if (p.error) errors.push(p.error);
      else if (!p.skip) values[a.code] = p.value;
    } else if (a.type === "choice") {
      const v = typeof e.value === "string" ? e.value.trim() : "";
      if (!v) continue;
      if (!(a.options || []).includes(v)) errors.push(`${a.name}: choose one of ${(a.options || []).join(", ")}.`);
      else values[a.code] = v;
    } else if (a.type === "text") {
      const v = typeof e.value === "string" ? e.value.trim() : "";
      if (!v) continue;
      if (v.length > 500) errors.push(`${a.name}: keep it under 500 characters.`);
      else values[a.code] = v;
    } else if (a.type === "sensitivity") {
      const list = Array.isArray(e.rows) ? e.rows : [];
      const clean = [];
      for (const r of list) {
        if (!r?.antibiotic) continue;
        if (!(a.options || []).includes(r.antibiotic)) {
          errors.push(`${a.name}: ${String(r.antibiotic).slice(0, 40)} is not on the panel.`);
          continue;
        }
        if (!SENSITIVITY_RESULTS.includes(r.result)) {
          errors.push(`${a.name}: ${r.antibiotic} must be S, I, R or NT.`);
          continue;
        }
        clean.push({ antibiotic: r.antibiotic, result: r.result });
      }
      if (clean.length) rows.set(a.code, clean);
    }
  }

  // Second pass: derived values from what was entered.
  const numericValues = { ...values };
  for (const a of analytes) {
    if (a.type !== "calculated") continue;
    const fn = FORMULAS[a.formula];
    if (!fn) continue;
    const v = fn(numericValues, ctx);
    if (v != null && Number.isFinite(v)) {
      const r = round(v, a.dp ?? 1);
      values[a.code] = r;
      numericValues[a.code] = r;
    }
  }

  // Build rows in the order the analytes are defined.
  const results = [];
  let isCritical = false;
  for (const a of analytes) {
    const has = values[a.code] !== undefined || rows.has(a.code);
    if (!has) continue;
    const row = { code: a.code, name: a.name, type: a.type, unit: a.unit || "", calculated: a.type === "calculated" };

    if (a.type === "numeric" || a.type === "calculated") {
      const value = values[a.code];
      const range = pickRange(a, ctx);
      const ev = evaluateNumeric(value, range);
      Object.assign(row, {
        value,
        dp: a.dp ?? 1,
        refText: rangeText(range, a.unit) || a.refNote || "",
        rangeSource: a.overridden ? "lab" : "default",
        flag: ev.flag,
        critical: ev.critical,
        abnormal: ev.flag != null && ev.flag !== "N",
      });
    } else if (a.type === "choice") {
      const value = values[a.code];
      const abnormal = (a.abnormal || []).includes(value);
      const critical = (a.critical || []).includes(value);
      Object.assign(row, { value, refText: a.refNote || "", flag: critical ? "HH" : abnormal ? "A" : "N", critical, abnormal });
    } else if (a.type === "text") {
      Object.assign(row, { value: values[a.code], refText: a.refNote || "", flag: null, critical: false, abnormal: false });
    } else if (a.type === "sensitivity") {
      Object.assign(row, { value: "", rows: rows.get(a.code), refText: "", flag: null, critical: false, abnormal: false });
    }
    if (row.critical) isCritical = true;
    results.push(row);
  }

  if (!results.length && !errors.length) errors.push("Enter at least one result.");
  return { results, isCritical, errors };
};

// Short text for the order list and older screens that read one string. Kept under the 500 character field limit.
export const summarise = (results) => {
  const flagText = (r) => (r.flag && r.flag !== "N" ? ` [${r.flag}]` : "");
  const one = (r) => {
    if (r.type === "sensitivity") return `${r.name}: ${(r.rows || []).length} antibiotics`;
    return `${r.name}: ${r.value}${r.unit ? " " + r.unit : ""}${flagText(r)}`;
  };
  let out = "";
  for (const r of results) {
    const piece = one(r);
    if ((out ? out.length + 2 : 0) + piece.length > 480) {
      out += out ? "; ..." : piece.slice(0, 480);
      break;
    }
    out += (out ? "; " : "") + piece;
  }
  return out;
};

export const summariseRanges = (results) => {
  const out = results
    .filter((r) => r.refText)
    .map((r) => `${r.name}: ${r.refText}`)
    .join("; ");
  return out.length > 195 ? out.slice(0, 192) + "..." : out;
};

// Used for a test with no analyte list, so no test is blocked from structured entry.
export const GENERIC_TEST = {
  key: "generic",
  name: "Result",
  generic: true,
  analytes: [
    { code: "result", name: "Result", type: "text" },
    { code: "unit", name: "Unit", type: "text" },
    { code: "reference", name: "Reference range", type: "text" },
    {
      code: "interpretation",
      name: "Interpretation",
      type: "choice",
      options: ["Normal", "Low", "High", "Abnormal", "Critical"],
      abnormal: ["Low", "High", "Abnormal", "Critical"],
      critical: ["Critical"],
    },
  ],
};

// A definition is well formed when every analyte can be processed. Used by the catalog tests.
export const validateTestDef = (def) => {
  const problems = [];
  const codes = new Set();
  for (const a of def.analytes || []) {
    const id = `${def.key}.${a.code}`;
    if (!a.code || !/^[a-z0-9_]+$/.test(a.code)) problems.push(`${id}: bad code`);
    if (codes.has(a.code)) problems.push(`${id}: duplicate code`);
    codes.add(a.code);
    if (!a.name) problems.push(`${id}: no name`);
    if (!["numeric", "choice", "text", "calculated", "sensitivity"].includes(a.type)) problems.push(`${id}: bad type ${a.type}`);
    if (a.type === "numeric") {
      if (typeof a.unit !== "string") problems.push(`${id}: numeric needs a unit (use "" for unitless)`);
      if (!(a.min < a.max)) problems.push(`${id}: needs min < max`);
      for (const r of a.ranges || []) {
        if (r.low != null && r.high != null && !(r.low < r.high)) problems.push(`${id}: range low >= high`);
        if (r.critLow != null && r.low != null && !(r.critLow < r.low)) problems.push(`${id}: critLow >= low`);
        if (r.critHigh != null && r.high != null && !(r.critHigh > r.high)) problems.push(`${id}: critHigh <= high`);
      }
      for (const u of a.altUnits || []) if (!(u.factor > 0)) problems.push(`${id}: bad unit factor`);
    }
    if (a.type === "choice" || a.type === "sensitivity") {
      if (!Array.isArray(a.options) || a.options.length < 2) problems.push(`${id}: needs options`);
      for (const x of [...(a.abnormal || []), ...(a.critical || [])]) {
        if (!(a.options || []).includes(x)) problems.push(`${id}: ${x} not in options`);
      }
    }
    if (a.type === "calculated" && !FORMULAS[a.formula]) problems.push(`${id}: unknown formula ${a.formula}`);
  }
  return problems;
};
