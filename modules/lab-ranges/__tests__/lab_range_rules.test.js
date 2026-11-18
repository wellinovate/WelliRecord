import test from "node:test";
import assert from "node:assert/strict";
import { validateRanges, applyOverrides } from "../lab_range_rules.js";
import { STRUCTURED_TESTS } from "../../lab-tests-catalog/lab_test_catalog_v2.js";
import { processResults } from "../../lab-tests-catalog/lab_result_engine.js";

const hb = STRUCTURED_TESTS.find((t) => t.key === "hb");
const analyte = hb.analytes[0];

test("accepts a clean range and keeps numbers", () => {
  const { ranges, errors } = validateRanges(analyte, [{ sex: "M", low: "13.5", high: 17.5, critLow: 7 }]);
  assert.deepEqual(errors, []);
  assert.equal(ranges[0].low, 13.5);
  assert.equal(ranges[0].ageMax, 200);
});

test("refuses bad limits, overlaps and non-numeric analytes", () => {
  assert.ok(validateRanges(analyte, [{ low: 15, high: 10 }]).errors.length);
  assert.ok(validateRanges(analyte, [{ low: 10, high: 15, critLow: 12 }]).errors.length);
  assert.ok(validateRanges(analyte, [{ sex: "M", low: 1, high: 2 }, { sex: "M", low: 1, high: 3 }]).errors.length);
  assert.ok(validateRanges(analyte, [{ sex: "X", low: 1, high: 2 }]).errors.length);
  assert.ok(validateRanges({ type: "choice" }, [{ low: 1, high: 2 }]).errors.length);
  assert.ok(validateRanges(analyte, []).errors.length);
});

test("a lab's range replaces the default and the row says so", () => {
  const { ranges } = validateRanges(analyte, [{ sex: "any", low: 11, high: 16 }]);
  const def = applyOverrides(hb, [{ code: "hb", ranges }]);
  const ctx = { sex: "M", ageYears: 40 };
  // 12.0 is low under the default male range (13.0 to 17.0) and normal under the lab's.
  const d = processResults(hb, [{ code: "hb", value: 12 }], ctx).results[0];
  const o = processResults(def, [{ code: "hb", value: 12 }], ctx).results[0];
  assert.equal(d.flag, "L");
  assert.equal(d.rangeSource, "default");
  assert.equal(o.flag, "N");
  assert.equal(o.rangeSource, "lab");
  assert.equal(hb.analytes[0].overridden, undefined);
});

test("no overrides returns the same test", () => {
  assert.equal(applyOverrides(hb, []), hb);
});
