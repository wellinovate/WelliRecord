import test from "node:test";
import assert from "node:assert/strict";
import { STRUCTURED_TESTS, ALL_ANALYTE_CODES } from "../lab_test_catalog_v2.js";
import { validateTestDef, processResults, patientContext } from "../lab_result_engine.js";
import { toCatalogDoc } from "../lab_test_catalog_service.js";

test("every structured test passes validation", () => {
  for (const t of STRUCTURED_TESTS) {
    const r = validateTestDef(t);
    const errs = Array.isArray(r) ? r : r?.errors || [];
    assert.deepEqual(errs, [], t.key);
  }
});

test("keys are unique and names are unique within a category", () => {
  const keys = new Set();
  const names = new Set();
  for (const t of STRUCTURED_TESTS) {
    assert.ok(!keys.has(t.key), `duplicate key ${t.key}`);
    keys.add(t.key);
    const k = `${t.category}|${t.name}`;
    assert.ok(!names.has(k), `duplicate name ${k}`);
    names.add(k);
  }
});

test("every test has a department, specimen and at least one analyte", () => {
  for (const t of STRUCTURED_TESTS) {
    assert.ok(t.labDepartment, t.key);
    assert.ok(t.specimen, `${t.key} needs a specimen`);
    assert.ok(t.analytes.length > 0, t.key);
  }
});

test("calculated analytes have their inputs in the same test", () => {
  const needs = {
    mcv: ["pcv", "rbc"], mch: ["hb", "rbc"], mchc: ["hb", "pcv"], vldl: ["tg"], ldl: ["tc", "hdl", "tg"],
    non_hdl: ["tc", "hdl"], tc_hdl_ratio: ["tc", "hdl"], indirect_bili: ["tbil", "dbil"], globulin: ["tp", "alb"],
    ag_ratio: ["tp", "alb"], anion_gap: ["na", "cl", "hco3"], egfr: ["creat"],
  };
  for (const t of STRUCTURED_TESTS) {
    const codes = new Set(t.analytes.map((a) => a.code));
    for (const a of t.analytes.filter((x) => x.type === "calculated")) {
      for (const dep of needs[a.formula] || []) assert.ok(codes.has(dep), `${t.key}: ${a.code} needs ${dep}`);
    }
  }
});

test("catalog covers the main departments and the flyer's tests", () => {
  const cats = new Set(STRUCTURED_TESTS.map((t) => t.category));
  for (const c of ["Haematology", "Coagulation", "Chemistry", "Lipid profile", "Thyroid", "Serology", "Urinalysis", "Microbiology", "Semen analysis", "Cancer markers", "Cardiac markers", "Drugs & toxicology", "Pathology & cytology"]) {
    assert.ok(cats.has(c), c);
  }
  assert.ok(ALL_ANALYTE_CODES.length > 100);
  assert.ok(STRUCTURED_TESTS.length >= 120);
});

test("catalog row keeps analytes and marks them unreviewed", () => {
  const doc = toCatalogDoc(STRUCTURED_TESTS.find((t) => t.key === "fbc"));
  assert.equal(doc.reviewStatus, "pending_clinical_review");
  assert.ok(doc.analytes.length >= 14);
});

test("a full blood count flags a low male haemoglobin and computes MCV", () => {
  const fbc = STRUCTURED_TESTS.find((t) => t.key === "fbc");
  const ctx = patientContext({ gender: "Male", dateOfBirth: "1990-01-01" }, new Date("2026-11-17"));
  const out = processResults(fbc, [{ code: "hb", value: 9.5 }, { code: "pcv", value: 28 }, { code: "rbc", value: 3.5 }], ctx);
  assert.deepEqual(out.errors, []);
  const hb = out.results.find((r) => r.code === "hb");
  assert.equal(hb.flag, "L");
  assert.equal(out.results.find((r) => r.code === "mcv").value, 80);
});

test("a lipid profile calculates LDL and skips it when triglycerides are 400 or more", () => {
  const lipid = STRUCTURED_TESTS.find((t) => t.key === "lipid");
  const ctx = patientContext({ gender: "Female", dateOfBirth: "1985-05-05" }, new Date("2026-11-17"));
  const ok = processResults(lipid, [{ code: "tc", value: 200 }, { code: "hdl", value: 50 }, { code: "tg", value: 150 }], ctx);
  assert.equal(ok.results.find((r) => r.code === "ldl").value, 120);
  const high = processResults(lipid, [{ code: "tc", value: 300 }, { code: "hdl", value: 40 }, { code: "tg", value: 450 }], ctx);
  assert.equal(high.results.find((r) => r.code === "ldl"), undefined);
});

test("culture accepts sensitivity rows from the antibiotic panel only", () => {
  const t = STRUCTURED_TESTS.find((x) => x.key === "urine_mcs");
  const good = processResults(t, [{ code: "growth", value: "Growth" }, { code: "sens", rows: [{ antibiotic: "Ciprofloxacin", result: "S" }] }], {});
  assert.deepEqual(good.errors, []);
  const bad = processResults(t, [{ code: "sens", rows: [{ antibiotic: "Made-up drug", result: "S" }] }], {});
  assert.ok(bad.errors.length);
});
