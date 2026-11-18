import test from "node:test";
import assert from "node:assert/strict";
import { calibrationStatus, nextCalibrationDue, reagentStatus, cleanAnalyzer, cleanReagent, cleanMovement, cleanEvent } from "../lab_equipment_rules.js";

const now = new Date("2026-11-18T10:00:00Z");
const ago = (d) => new Date(now.getTime() - d * 86400000);
const ahead = (d) => new Date(now.getTime() + d * 86400000);

test("calibration status from last date and interval", () => {
  assert.equal(calibrationStatus({}, now), "unknown");
  assert.equal(calibrationStatus({ lastCalibrationAt: ago(10), calibrationIntervalDays: 180 }, now), "ok");
  assert.equal(calibrationStatus({ lastCalibrationAt: ago(170), calibrationIntervalDays: 180 }, now), "due_soon");
  assert.equal(calibrationStatus({ lastCalibrationAt: ago(200), calibrationIntervalDays: 180 }, now), "overdue");
  assert.equal(nextCalibrationDue({ lastCalibrationAt: "2026-01-01", calibrationIntervalDays: 30 }).toISOString().slice(0, 10), "2026-01-31");
});

test("reagent status: expired, empty, low, expiring, ok", () => {
  assert.equal(reagentStatus({ quantity: 5, expiresOn: ago(1) }, now), "expired");
  assert.equal(reagentStatus({ quantity: 0, expiresOn: ahead(100) }, now), "empty");
  assert.equal(reagentStatus({ quantity: 3, reorderLevel: 3, expiresOn: ahead(100) }, now), "low");
  assert.equal(reagentStatus({ quantity: 10, reorderLevel: 3, expiresOn: ahead(10) }, now), "expiring");
  assert.equal(reagentStatus({ quantity: 10, reorderLevel: 3, expiresOn: ahead(200) }, now), "ok");
  assert.equal(reagentStatus({ quantity: 10 }, now), "ok");
});

test("analyzer input is cleaned and bad input is refused", () => {
  assert.deepEqual(cleanAnalyzer({ name: "  " }).errors, ["Name is required."]);
  assert.ok(cleanAnalyzer({ name: "A", calibrationIntervalDays: 0 }).errors.length);
  assert.ok(cleanAnalyzer({ name: "A", lastCalibrationAt: "2999-01-01" }).errors.length);
  assert.ok(cleanAnalyzer({ name: "A", status: "broken" }).errors.length);
  const ok = cleanAnalyzer({ name: " Sysmex XN ", calibrationIntervalDays: "180", lastCalibrationAt: "2026-10-01" });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.name, "Sysmex XN");
  assert.equal(ok.value.calibrationIntervalDays, 180);
  assert.deepEqual(cleanAnalyzer({ notes: "x" }, { partial: true }).errors, []);
});

test("reagent input", () => {
  assert.ok(cleanReagent({ name: "" }).errors.length);
  assert.ok(cleanReagent({ name: "R", reorderLevel: -1 }).errors.length);
  assert.ok(cleanReagent({ name: "R", expiresOn: "nope" }).errors.length);
  assert.deepEqual(cleanReagent({ name: "R", reorderLevel: "5", expiresOn: "2027-01-01" }).errors, []);
});

test("stock movements get the right sign and adjustments need a reason", () => {
  assert.equal(cleanMovement({ reason: "received", quantity: -4 }).value.change, 4);
  assert.equal(cleanMovement({ reason: "used", quantity: 2 }).value.change, -2);
  assert.equal(cleanMovement({ reason: "wasted", quantity: 2 }).value.change, -2);
  assert.ok(cleanMovement({ reason: "adjustment", quantity: 2 }).errors.length);
  assert.equal(cleanMovement({ reason: "adjustment", quantity: -2, note: "recount" }).value.change, -2);
  assert.ok(cleanMovement({ reason: "used", quantity: 0 }).errors.length);
  assert.ok(cleanMovement({ reason: "stolen", quantity: 1 }).errors.length);
});

test("events: QC needs pass or fail, no future dates", () => {
  assert.ok(cleanEvent({ type: "qc" }).errors.length);
  assert.deepEqual(cleanEvent({ type: "qc", result: "fail" }).errors, []);
  assert.ok(cleanEvent({ type: "calibration", performedAt: "2999-01-01" }).errors.length);
  assert.ok(cleanEvent({ type: "x" }).errors.length);
});
