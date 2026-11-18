// Daily quality control for analysers: control sample results judged by Westgard multirules.
// Pure: no database. A fail means results from that analyser should not be trusted until it is fixed.

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export const zScore = (value, mean, sd) => (sd > 0 ? round((value - mean) / sd, 3) : 0);

// history: earlier runs of the same control and analyte on the same analyser, newest first, each with z.
// Rules: 1-3s fail, 2-2s fail, R-4s fail, 4-1s fail, 10x fail, 1-2s warning.
export const evaluateQc = ({ value, mean, sd }, history = []) => {
  const z = zScore(value, mean, sd);
  const prev = history.map((h) => h.z);
  const violations = [];
  if (Math.abs(z) > 3) violations.push("1-3s");
  if (prev.length >= 1 && ((z > 2 && prev[0] > 2) || (z < -2 && prev[0] < -2))) violations.push("2-2s");
  if (prev.length >= 1 && ((z > 2 && prev[0] < -2) || (z < -2 && prev[0] > 2))) violations.push("R-4s");
  if (prev.length >= 3) {
    const last4 = [z, ...prev.slice(0, 3)];
    if (last4.every((x) => x > 1) || last4.every((x) => x < -1)) violations.push("4-1s");
  }
  if (prev.length >= 9) {
    const last10 = [z, ...prev.slice(0, 9)];
    if (last10.every((x) => x > 0) || last10.every((x) => x < 0)) violations.push("10x");
  }
  if (violations.length) return { z, status: "fail", violations };
  if (Math.abs(z) > 2) return { z, status: "warn", violations: ["1-2s"] };
  return { z, status: "pass", violations: [] };
};

export const RULE_TEXT = {
  "1-3s": "One control is more than 3 SD from its target.",
  "2-2s": "Two controls in a row are more than 2 SD out on the same side.",
  "R-4s": "Two controls in a row are more than 4 SD apart.",
  "4-1s": "Four controls in a row are more than 1 SD out on the same side.",
  "10x": "Ten controls in a row are on the same side of the target.",
  "1-2s": "One control is more than 2 SD from its target. Check the next run.",
};

export const cleanQcRun = (input = {}) => {
  const errors = [];
  const num = (v) => (v === "" || v == null ? NaN : Number(v));
  const out = {
    controlName: String(input.controlName || "").trim().slice(0, 80),
    lotNumber: String(input.lotNumber || "").trim().slice(0, 60),
    analyte: String(input.analyte || "").trim().slice(0, 80),
    unit: String(input.unit || "").trim().slice(0, 30),
    note: String(input.note || "").trim().slice(0, 500),
    value: num(input.value),
    mean: num(input.mean),
    sd: num(input.sd),
  };
  if (!out.controlName) errors.push("Name the control (for example Level 1).");
  if (!out.analyte) errors.push("Name the test the control was run for.");
  if (!Number.isFinite(out.value)) errors.push("Enter the value the analyser gave.");
  if (!Number.isFinite(out.mean)) errors.push("Enter the target mean from the control insert.");
  if (!(Number.isFinite(out.sd) && out.sd > 0)) errors.push("Enter the standard deviation from the control insert. It must be above zero.");
  const at = input.runAt ? new Date(input.runAt) : new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60 * 1000) errors.push("The run time is not valid.");
  out.runAt = at;
  return { value: out, errors };
};

// An analyser is blocked when the newest run of any control and analyte in the last 24 hours failed.
export const qcGate = (runs = [], now = new Date(), windowHours = 24) => {
  const cutoff = now.getTime() - windowHours * 3600 * 1000;
  const latest = new Map();
  for (const r of runs) {
    const t = new Date(r.runAt).getTime();
    if (t < cutoff) continue;
    const key = `${r.controlName}|${r.analyte}`;
    const cur = latest.get(key);
    if (!cur || t > new Date(cur.runAt).getTime()) latest.set(key, r);
  }
  const failing = [...latest.values()].filter((r) => r.status === "fail");
  return { blocked: failing.length > 0, failing, checkedToday: latest.size > 0 };
};
