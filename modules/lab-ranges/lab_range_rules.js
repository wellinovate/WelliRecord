// Rules for a lab's own reference ranges. No database here.
// A lab's ranges for an analyte replace the catalog defaults for that analyte, in the analyte's own unit.

const SEXES = ["any", "M", "F"];
const num = (v) => v === null || v === undefined || v === "" ? null : Number(v);

export const MAX_RANGES = 8;

// Returns { ranges, errors }. Ranges are cleaned copies; errors are plain sentences.
export const validateRanges = (analyte, input) => {
  const errors = [];
  if (!analyte || (analyte.type !== "numeric" && analyte.type !== "calculated")) {
    return { ranges: [], errors: ["Ranges can be set only for numeric results."] };
  }
  if (!Array.isArray(input) || input.length === 0) return { ranges: [], errors: ["Add at least one range."] };
  if (input.length > MAX_RANGES) return { ranges: [], errors: [`Use ${MAX_RANGES} ranges or fewer.`] };

  const ranges = [];
  input.forEach((r, i) => {
    const at = `Range ${i + 1}`;
    const sex = r?.sex ?? "any";
    if (!SEXES.includes(sex)) return errors.push(`${at}: sex must be any, M or F.`);
    const low = num(r.low), high = num(r.high), critLow = num(r.critLow), critHigh = num(r.critHigh);
    const ageMin = num(r.ageMin) ?? 0, ageMax = num(r.ageMax) ?? 200;
    for (const [k, v] of Object.entries({ low, high, critLow, critHigh })) {
      if (v !== null && !Number.isFinite(v)) return errors.push(`${at}: ${k} must be a number.`);
    }
    if (low === null && high === null) return errors.push(`${at}: set a low limit, a high limit or both.`);
    if (low !== null && high !== null && low >= high) return errors.push(`${at}: low must be below high.`);
    if (critLow !== null && low !== null && critLow > low) return errors.push(`${at}: critical low must not be above low.`);
    if (critHigh !== null && high !== null && critHigh < high) return errors.push(`${at}: critical high must not be below high.`);
    if (!(ageMin >= 0 && ageMax > ageMin && ageMax <= 200)) return errors.push(`${at}: check the age limits.`);
    if (analyte.min != null && [low, high, critLow, critHigh].some((v) => v !== null && v < 0)) return errors.push(`${at}: limits cannot be negative.`);
    const text = typeof r.text === "string" ? r.text.trim().slice(0, 60) : "";
    ranges.push({ sex, ageMin, ageMax, low, high, critLow, critHigh, ...(text ? { text } : {}) });
  });
  // Two ranges for the same sex and age would be ambiguous.
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i], b = ranges[j];
      if (a.sex === b.sex && a.ageMin < b.ageMax && b.ageMin < a.ageMax) {
        errors.push(`Ranges ${i + 1} and ${j + 1} overlap for the same sex and age.`);
      }
    }
  }
  return { ranges: errors.length ? [] : ranges, errors };
};

// overrides: [{ code, ranges }]. Returns a copy of the test with those analytes' ranges replaced.
export const applyOverrides = (testDef, overrides) => {
  if (!testDef || !overrides?.length) return testDef;
  const by = new Map(overrides.map((o) => [o.code, o.ranges]));
  return {
    ...testDef,
    analytes: testDef.analytes.map((a) => (by.has(a.code) ? { ...a, ranges: by.get(a.code), overridden: true } : a)),
  };
};
