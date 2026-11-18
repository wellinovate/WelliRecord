// Delta check: compares a numeric result with the same patient's previous result for the same test.
// Thresholds are defaults chosen for a first release and have not been clinically reviewed.
export const DELTA_WINDOW_DAYS = 90;

export const DELTA_RULES = {
  hb: { abs: 2 }, // g/dL
  k: { abs: 1 }, // mmol/L
  na: { abs: 8 }, // mmol/L
  creat: { pct: 50 },
  urea: { pct: 50 },
  plt: { pct: 50 },
  wbc: { pct: 50 },
  glu_f: { pct: 50 },
  glu_r: { pct: 50 },
  inr: { pct: 50 },
  tsh: { pct: 100 },
  alt: { pct: 100 },
  ast: { pct: 100 },
};

// current, previous: result rows from the engine. Returns the changes that pass a rule.
export const deltaChecks = (current, previous, previousDate, now = new Date()) => {
  if (!previous?.length || !previousDate) return [];
  const ageDays = (now.getTime() - new Date(previousDate).getTime()) / 86400000;
  if (!(ageDays >= 0 && ageDays <= DELTA_WINDOW_DAYS)) return [];
  const prev = new Map(previous.map((r) => [r.code, r]));
  const out = [];
  for (const r of current || []) {
    const rule = DELTA_RULES[r.code];
    const p = prev.get(r.code);
    if (!rule || !p || typeof r.value !== "number" || typeof p.value !== "number" || p.value === 0) continue;
    const abs = Math.abs(r.value - p.value);
    const pct = (abs / Math.abs(p.value)) * 100;
    if ((rule.abs != null && abs >= rule.abs) || (rule.pct != null && pct >= rule.pct)) {
      out.push({
        code: r.code, name: r.name, unit: r.unit || "",
        previous: p.value, current: r.value, previousDate: new Date(previousDate).toISOString(),
        changePct: Math.round(pct),
      });
    }
  }
  return out;
};
