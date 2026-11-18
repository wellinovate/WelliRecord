import test from "node:test";
import assert from "node:assert/strict";
import {
  patientContext, pickRange, evaluateNumeric, processResults, summarise, GENERIC_TEST, validateTestDef, FORMULAS,
} from "../lab_result_engine.js";

const hb = {
  code: "hb", name: "Haemoglobin", type: "numeric", unit: "g/dL", dp: 1, min: 1, max: 30,
  altUnits: [{ unit: "g/L", factor: 0.1 }],
  ranges: [
    { sex: "M", ageMin: 18, ageMax: 200, low: 13, high: 17, critLow: 7, critHigh: 20 },
    { sex: "F", ageMin: 18, ageMax: 200, low: 12, high: 15.5, critLow: 7, critHigh: 20 },
    { sex: "any", ageMin: 0, ageMax: 18, low: 11, high: 14, critLow: 7, critHigh: 20 },
  ],
};
const male40 = { sex: "M", ageYears: 40 };
const female30 = { sex: "F", ageYears: 30 };

test("patientContext reads sex and age", () => {
  const at = new Date("2026-11-17T00:00:00Z");
  const c = patientContext({ gender: "Female", dateOfBirth: "1996-11-17" }, at);
  assert.equal(c.sex, "F");
  assert.ok(Math.abs(c.ageYears - 30) < 0.01);
  assert.equal(patientContext({ gender: "Other" }).sex, null);
  assert.equal(patientContext({}).ageYears, null);
  assert.equal(patientContext({ dateOfBirth: "2099-01-01" }, at).ageYears, null);
});

test("pickRange prefers sex then age", () => {
  assert.equal(pickRange(hb, male40).low, 13);
  assert.equal(pickRange(hb, female30).low, 12);
  assert.equal(pickRange(hb, { sex: "M", ageYears: 10 }).low, 11);
});

test("pickRange with unknown sex or age returns no range when only specific ranges exist", () => {
  assert.equal(pickRange(hb, { sex: null, ageYears: 40 }), null);
  assert.equal(pickRange(hb, { sex: "M", ageYears: null }), null);
  const general = { ranges: [{ sex: "any", low: 1, high: 2 }] };
  assert.equal(pickRange(general, { sex: null, ageYears: null }).low, 1);
});

test("evaluateNumeric flags low, high and critical", () => {
  const r = pickRange(hb, male40);
  assert.deepEqual(evaluateNumeric(14, r), { flag: "N", critical: false });
  assert.deepEqual(evaluateNumeric(12.9, r), { flag: "L", critical: false });
  assert.deepEqual(evaluateNumeric(17.1, r), { flag: "H", critical: false });
  assert.deepEqual(evaluateNumeric(6.5, r), { flag: "LL", critical: true });
  assert.deepEqual(evaluateNumeric(21, r), { flag: "HH", critical: true });
  assert.deepEqual(evaluateNumeric(13, r), { flag: "N", critical: false });
  assert.deepEqual(evaluateNumeric(5, null), { flag: null, critical: false });
});

test("the same value is read against the patient's own range", () => {
  const m = processResults({ analytes: [hb] }, [{ code: "hb", value: "12.5" }], male40);
  const f = processResults({ analytes: [hb] }, [{ code: "hb", value: "12.5" }], female30);
  assert.equal(m.results[0].flag, "L");
  assert.equal(f.results[0].flag, "N");
});

test("a critical value sets isCritical", () => {
  const r = processResults({ analytes: [hb] }, [{ code: "hb", value: 6.1 }], male40);
  assert.equal(r.isCritical, true);
  assert.equal(r.results[0].critical, true);
});

test("alternate units are converted", () => {
  const r = processResults({ analytes: [hb] }, [{ code: "hb", value: 125, unit: "g/L" }], female30);
  assert.equal(r.results[0].value, 12.5);
  const bad = processResults({ analytes: [hb] }, [{ code: "hb", value: 12, unit: "oz" }], female30);
  assert.match(bad.errors[0], /not supported/);
});

test("impossible values and non numbers are refused", () => {
  assert.match(processResults({ analytes: [hb] }, [{ code: "hb", value: 400 }], male40).errors[0], /outside the possible range/);
  assert.match(processResults({ analytes: [hb] }, [{ code: "hb", value: "abc" }], male40).errors[0], /enter a number/);
  assert.match(processResults({ analytes: [hb] }, [{ code: "hb", value: -1 }], male40).errors[0], /outside the possible range/);
});

test("unknown fields are refused and an empty entry is refused", () => {
  assert.match(processResults({ analytes: [hb] }, [{ code: "zzz", value: 1 }], male40).errors[0], /Unknown result field/);
  assert.match(processResults({ analytes: [hb] }, [], male40).errors[0], /at least one/);
});

test("choice values must be on the list and abnormal ones are flagged", () => {
  const hiv = { code: "hiv", name: "HIV", type: "choice", options: ["Non-reactive", "Reactive"], abnormal: ["Reactive"] };
  const ok = processResults({ analytes: [hiv] }, [{ code: "hiv", value: "Reactive" }], {});
  assert.equal(ok.results[0].flag, "A");
  assert.equal(ok.results[0].abnormal, true);
  assert.equal(processResults({ analytes: [hiv] }, [{ code: "hiv", value: "Non-reactive" }], {}).results[0].flag, "N");
  assert.match(processResults({ analytes: [hiv] }, [{ code: "hiv", value: "Maybe" }], {}).errors[0], /choose one of/);
});

test("MCV, MCH and MCHC from a worked example", () => {
  // Hb 14 g/dL, PCV 42 %, RBC 4.8 x10^12/L -> MCV 87.5, MCH 29.2, MCHC 33.3
  const v = { hb: 14, pcv: 42, rbc: 4.8 };
  assert.ok(Math.abs(FORMULAS.mcv(v) - 87.5) < 0.01);
  assert.ok(Math.abs(FORMULAS.mch(v) - 29.17) < 0.01);
  assert.ok(Math.abs(FORMULAS.mchc(v) - 33.33) < 0.01);
  assert.equal(FORMULAS.mcv({ pcv: 42 }), null);
});

test("lipid formulas and the Friedewald limit", () => {
  // TC 200, HDL 50, TG 150 -> VLDL 30, LDL 120, non-HDL 150
  const v = { tc: 200, hdl: 50, tg: 150 };
  assert.equal(FORMULAS.vldl(v), 30);
  assert.equal(FORMULAS.ldl(v), 120);
  assert.equal(FORMULAS.non_hdl(v), 150);
  assert.equal(FORMULAS.ldl({ tc: 250, hdl: 40, tg: 450 }), null);
});

test("liver and electrolyte formulas", () => {
  assert.ok(Math.abs(FORMULAS.indirect_bili({ tbil: 1.0, dbil: 0.3 }) - 0.7) < 1e-9);
  assert.equal(FORMULAS.indirect_bili({ tbil: 0.2, dbil: 0.3 }), 0);
  assert.equal(FORMULAS.globulin({ tp: 7, alb: 4 }), 3);
  assert.ok(Math.abs(FORMULAS.ag_ratio({ tp: 7, alb: 4 }) - 1.333) < 0.001);
  assert.equal(FORMULAS.anion_gap({ na: 140, cl: 104, hco3: 24 }), 12);
});

test("eGFR CKD-EPI 2021 against worked values", () => {
  // 50 year old man, creatinine 1.0 mg/dL -> about 92
  const m = FORMULAS.egfr({ creat: 1.0 }, { sex: "M", ageYears: 50 });
  assert.ok(Math.abs(m - 91.7) < 1, `got ${m}`);
  // 50 year old woman, creatinine 1.0 mg/dL -> 142 x 1.4286^-1.2 x 0.9938^50 x 1.012 = 68.6
  const f = FORMULAS.egfr({ creat: 1.0 }, { sex: "F", ageYears: 50 });
  assert.ok(Math.abs(f - 68.6) < 0.2, `got ${f}`);
  // not for children, not without sex or age
  assert.equal(FORMULAS.egfr({ creat: 0.5 }, { sex: "M", ageYears: 10 }), null);
  assert.equal(FORMULAS.egfr({ creat: 1.0 }, { sex: null, ageYears: 40 }), null);
  assert.equal(FORMULAS.egfr({ creat: 1.0 }, { sex: "M", ageYears: null }), null);
});

test("calculated values ignore anything the client sends", () => {
  const def = {
    analytes: [
      { code: "hb", name: "Hb", type: "numeric", unit: "g/dL", min: 1, max: 30, dp: 1 },
      { code: "pcv", name: "PCV", type: "numeric", unit: "%", min: 5, max: 70, dp: 0 },
      { code: "rbc", name: "RBC", type: "numeric", unit: "x10^12/L", min: 1, max: 9, dp: 2 },
      { code: "mcv", name: "MCV", type: "calculated", formula: "mcv", unit: "fL", dp: 1 },
    ],
  };
  const r = processResults(def, [
    { code: "hb", value: 14 }, { code: "pcv", value: 42 }, { code: "rbc", value: 4.8 }, { code: "mcv", value: 999 },
  ], {});
  const mcv = r.results.find((x) => x.code === "mcv");
  assert.equal(mcv.value, 87.5);
  assert.equal(mcv.calculated, true);
});

test("sensitivity rows are checked against the panel", () => {
  const def = { analytes: [{ code: "ast", name: "Sensitivity", type: "sensitivity", options: ["Ciprofloxacin", "Amoxicillin"] }] };
  const ok = processResults(def, [{ code: "ast", rows: [{ antibiotic: "Ciprofloxacin", result: "S" }, { antibiotic: "Amoxicillin", result: "R" }] }], {});
  assert.equal(ok.results[0].rows.length, 2);
  const bad = processResults(def, [{ code: "ast", rows: [{ antibiotic: "Nope", result: "S" }, { antibiotic: "Amoxicillin", result: "X" }] }], {});
  assert.equal(bad.errors.length, 2);
});

test("generic test handles any test with no analyte list", () => {
  const r = processResults(GENERIC_TEST, [
    { code: "result", value: "5.2" }, { code: "unit", value: "mg/L" }, { code: "interpretation", value: "Critical" },
  ], {});
  assert.equal(r.isCritical, true);
  assert.equal(r.results.length, 3);
});

test("summarise stays under the 500 character field limit", () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ name: `Analyte ${i}`, type: "numeric", value: 1.5, unit: "u", flag: "H" }));
  assert.ok(summarise(rows).length <= 500);
  assert.equal(summarise([{ name: "Hb", type: "numeric", value: 11.2, unit: "g/dL", flag: "L" }]), "Hb: 11.2 g/dL [L]");
});

test("validateTestDef catches malformed definitions", () => {
  const bad = { key: "t", analytes: [
    { code: "A", name: "x", type: "numeric" },
    { code: "b", name: "y", type: "numeric", unit: "u", min: 5, max: 1 },
    { code: "c", name: "z", type: "choice", options: ["a"] },
    { code: "d", name: "w", type: "calculated", formula: "nope" },
  ] };
  assert.ok(validateTestDef(bad).length >= 5);
  assert.deepEqual(validateTestDef({ key: "ok", analytes: [hb] }), []);
});
