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

import { planDeduction, cleanUsage, cleanCodeMap, parseHl7Oru, mapInstrumentResults } from "../lab_equipment_rules.js";

test("deduction takes the earliest-expiring lot first and skips expired and empty lots", () => {
  const lots = [
    { _id: "late", quantity: 10, expiresOn: ahead(300) },
    { _id: "soon", quantity: 2, expiresOn: ahead(20) },
    { _id: "gone", quantity: 9, expiresOn: ago(5) },
    { _id: "empty", quantity: 0, expiresOn: ahead(10) },
  ];
  const p = planDeduction(lots, 5, now);
  assert.deepEqual(p.allocations.map((a) => [a.reagentId, a.take]), [["soon", 2], ["late", 3]]);
  assert.equal(p.shortfall, 0);
  const short = planDeduction([{ _id: "a", quantity: 1 }], 3, now);
  assert.equal(short.shortfall, 2);
  assert.equal(planDeduction([], 1, now).shortfall, 1);
});

test("usage and code map input", () => {
  assert.ok(cleanUsage({ testKey: "fbc", reagentName: "Diluent", quantityPerRun: 0 }).errors.length);
  assert.deepEqual(cleanUsage({ testKey: "fbc", reagentName: "Diluent", quantityPerRun: "0.5" }).errors, []);
  assert.ok(cleanCodeMap([{ instrumentCode: "HGB", analyteCode: "hb" }, { instrumentCode: "hgb", analyteCode: "pcv" }]).errors.length);
  assert.deepEqual(cleanCodeMap([{ instrumentCode: "HGB", analyteCode: "hb" }]).errors, []);
});

const ORU = [
  "MSH|^~\\&|XN|LAB|WR|WR|20261118101500||ORU^R01|123|P|2.3",
  "PID|1||12345",
  "OBR|1||LB-ABC1234567|CBC^Complete blood count",
  "OBX|1|NM|HGB^Haemoglobin||13.4|g/dL|13-17|N|||F",
  "OBX|2|NM|WBC^WBC||6.1|10*9/L|4-11|N|||F",
  "OBX|3|NM|XYZ^Unknown||5|u||||F",
  "OBX|4|NM|PLT^Platelets||250|10*9/L|||||P",
  "OBX|5|ST|COMMENT^Note||ok||||||F",
].join("\r");

test("parses an HL7 ORU message and keeps only final results", () => {
  const r = parseHl7Oru(ORU);
  assert.deepEqual(r.errors, []);
  assert.equal(r.barcode, "LB-ABC1234567");
  assert.deepEqual(r.observations.map((o) => o.code), ["HGB", "WBC", "XYZ", "COMMENT"]);
  assert.equal(r.observations[0].value, "13.4");
  assert.equal(r.observations[0].unit, "g/dL");
});

test("refuses things that are not result messages", () => {
  assert.ok(parseHl7Oru("hello").errors.length);
  assert.ok(parseHl7Oru("MSH|^~\\&|A|B|C|D|2026||ADT^A01|1|P|2.3").errors.length);
  assert.ok(parseHl7Oru("MSH|^~\\&|A|B|C|D|2026||ORU^R01|1|P|2.3\rOBX|1|NM|HGB||1|g/dL||||||F").errors.includes("No sample id in the message."));
});

test("maps instrument codes to result fields and reports the rest", () => {
  const { observations } = parseHl7Oru(ORU);
  const out = mapInstrumentResults(observations, [{ instrumentCode: "HGB", analyteCode: "hb" }, { instrumentCode: "WBC", analyteCode: "wbc" }], ["hb", "wbc", "plt"]);
  assert.deepEqual(out.entries, [{ code: "hb", value: "13.4", unit: "g/dL" }, { code: "wbc", value: "6.1", unit: "10*9/L" }]);
  const withUnit = mapInstrumentResults(observations, [{ instrumentCode: "WBC", analyteCode: "wbc", unit: "x10^9/L" }], ["wbc"]);
  assert.deepEqual(withUnit.entries, [{ code: "wbc", value: "6.1", unit: "x10^9/L" }]);
  assert.deepEqual(out.unmapped, ["XYZ", "COMMENT"]);
  // A mapping to a field the test does not have is not used.
  assert.deepEqual(mapInstrumentResults(observations, [{ instrumentCode: "HGB", analyteCode: "hb" }], ["wbc"]).entries, []);
});
