import test from "node:test";
import assert from "node:assert/strict";
import { zScore, evaluateQc, cleanQcRun, qcGate } from "../lab_qc_rules.js";

const hist = (...zs) => zs.map((z) => ({ z }));

test("z score", () => {
  assert.equal(zScore(110, 100, 5), 2);
  assert.equal(zScore(5, 5, 0), 0);
});

test("a control inside 2 SD passes", () => {
  assert.equal(evaluateQc({ value: 101, mean: 100, sd: 5 }, hist(0.5, -0.2)).status, "pass");
});

test("1-2s warns, 1-3s fails", () => {
  assert.deepEqual(evaluateQc({ value: 111, mean: 100, sd: 5 }, []).violations, ["1-2s"]);
  assert.equal(evaluateQc({ value: 111, mean: 100, sd: 5 }, []).status, "warn");
  const f = evaluateQc({ value: 116, mean: 100, sd: 5 }, []);
  assert.equal(f.status, "fail");
  assert.deepEqual(f.violations, ["1-3s"]);
});

test("2-2s: two in a row beyond 2 SD on the same side", () => {
  const r = evaluateQc({ value: 111, mean: 100, sd: 5 }, hist(2.4));
  assert.equal(r.status, "fail");
  assert.ok(r.violations.includes("2-2s"));
  assert.equal(evaluateQc({ value: 111, mean: 100, sd: 5 }, hist(1.5)).status, "warn");
});

test("R-4s: swing across the mean", () => {
  const r = evaluateQc({ value: 111, mean: 100, sd: 5 }, hist(-2.3));
  assert.ok(r.violations.includes("R-4s"));
});

test("4-1s and 10x trends fail", () => {
  assert.ok(evaluateQc({ value: 106, mean: 100, sd: 5 }, hist(1.2, 1.1, 1.4)).violations.includes("4-1s"));
  assert.ok(evaluateQc({ value: 101, mean: 100, sd: 5 }, hist(0.2, 0.3, 0.1, 0.4, 0.2, 0.5, 0.1, 0.3, 0.2)).violations.includes("10x"));
  assert.equal(evaluateQc({ value: 101, mean: 100, sd: 5 }, hist(0.2, -0.3, 0.1, 0.4, 0.2, 0.5, 0.1, 0.3, 0.2)).status, "pass");
});

test("clean run needs the control insert values", () => {
  assert.ok(cleanQcRun({}).errors.length >= 4);
  assert.ok(cleanQcRun({ controlName: "L1", analyte: "Glucose", value: 5, mean: 5, sd: 0 }).errors.some((e) => /standard deviation/.test(e)));
  assert.equal(cleanQcRun({ controlName: "L1", analyte: "Glucose", value: 5, mean: 5, sd: 0.2 }).errors.length, 0);
  assert.ok(cleanQcRun({ controlName: "L1", analyte: "G", value: 1, mean: 1, sd: 1, runAt: "2999-01-01" }).errors.length > 0);
});

test("gate blocks on the newest failing run only, within 24 hours", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const run = (h, status, c = "L1") => ({ controlName: c, analyte: "Glu", status, runAt: new Date(now.getTime() - h * 3600000) });
  assert.equal(qcGate([run(5, "fail")], now).blocked, true);
  assert.equal(qcGate([run(5, "fail"), run(2, "pass")], now).blocked, false);
  assert.equal(qcGate([run(30, "fail")], now).blocked, false);
  assert.equal(qcGate([run(5, "pass"), run(3, "fail", "L2")], now).blocked, true);
  assert.equal(qcGate([], now).checkedToday, false);
});
