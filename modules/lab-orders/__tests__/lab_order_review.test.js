import test from "node:test";
import assert from "node:assert/strict";
import { canReview, reviewerConflict, canRelease, canEditPatientNote, cleanReview, cleanPatientNote, buildPatientRecords } from "../lab_order_rules.js";

test("review applies to verified, unapproved orders only", () => {
  assert.equal(canReview({ status: "verified" }), true);
  assert.equal(canReview({ status: "verified", approval: { status: "approved" } }), false);
  assert.equal(canReview({ status: "quality-control" }), false);
});

test("the person who entered or verified cannot approve", () => {
  const o = { enteredBy: "u1", verifiedByUserId: "u2" };
  assert.equal(reviewerConflict(o, "u1"), true);
  assert.equal(reviewerConflict(o, "u2"), true);
  assert.equal(reviewerConflict(o, "u3"), false);
  assert.equal(reviewerConflict(o, ""), false);
});

test("release needs an approval and happens once", () => {
  assert.equal(canRelease({ status: "verified" }), false);
  assert.equal(canRelease({ status: "verified", approval: { status: "approved" } }), true);
  assert.equal(canRelease({ status: "verified", approval: { status: "approved" }, transmittedAt: new Date() }), false);
  assert.equal(canRelease({ status: "quality-control", approval: { status: "approved" } }), false);
});

test("a note can change until release", () => {
  assert.equal(canEditPatientNote({ status: "verified" }), true);
  assert.equal(canEditPatientNote({ status: "released" }), false);
  assert.equal(canEditPatientNote({ status: "cancelled" }), false);
});

test("returning needs a reason; approving does not", () => {
  assert.ok(cleanReview({ decision: "return", comment: "" }).errors.length);
  assert.deepEqual(cleanReview({ decision: "return", comment: "Recheck the haemoglobin" }).errors, []);
  assert.deepEqual(cleanReview({ decision: "approve" }).errors, []);
  assert.ok(cleanReview({ decision: "maybe" }).errors.length);
});

test("patient note is trimmed, limited and typed", () => {
  assert.equal(cleanPatientNote({ text: "  Sample was haemolysed.  ", issueType: "sample_quality" }).value.text, "Sample was haemolysed.");
  assert.ok(cleanPatientNote({ text: "x".repeat(601) }).errors.length);
  assert.ok(cleanPatientNote({ text: "a", issueType: "gossip" }).errors.length);
  assert.equal(cleanPatientNote({ text: "" }).value.text, "");
});

test("patient records: one per row, plain names for numbers, prefixed for text, note on each", () => {
  const order = {
    testKey: "fbc", testName: "Full blood count (FBC)", category: "hematology",
    patientNote: { text: "Please repeat in 2 weeks." },
    results: [
      { type: "numeric", name: "Haemoglobin", value: 9.5, unit: "g/dL", refText: "13.0 - 17.0 g/dL", flag: "L" },
      { type: "calculated", name: "MCV", value: 80, unit: "fL", flag: "N" },
      { type: "choice", name: "Rhesus (D)", value: "Positive", flag: "N" },
      { type: "sensitivity", name: "Antibiotic sensitivity", rows: [{ antibiotic: "Ciprofloxacin", result: "S" }, { antibiotic: "Gentamicin", result: "R" }] },
    ],
  };
  const recs = buildPatientRecords(order);
  assert.deepEqual(recs.map((r) => r.testName), ["Haemoglobin", "MCV", "Full blood count (FBC): Rhesus (D)", "Full blood count (FBC): Antibiotic sensitivity"]);
  assert.equal(recs[0].interpretation, "low");
  assert.equal(recs[0].unit, "g/dL");
  assert.equal(recs[2].unit, undefined);
  assert.equal(recs[3].resultValue, "Ciprofloxacin S; Gentamicin R");
  assert.ok(recs.every((r) => r.labNote === "Please repeat in 2 weeks."));
  const urine = buildPatientRecords({ testKey: "urinalysis", testName: "Urinalysis", results: [{ type: "numeric", name: "pH", value: 6, unit: "" }] });
  assert.equal(urine[0].testName, "Urinalysis: pH");
});

test("an order with only free text is sent as one record, critical flag kept", () => {
  const recs = buildPatientRecords({ testName: "Widal", category: "serology", measuredValue: "Positive 1:160", normalRange: "Negative", interpretation: "Possible recent infection", isCritical: false, patientNote: { text: "Come back for review." } });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].resultValue, "Positive 1:160");
  assert.equal(recs[0].labNote, "Come back for review.");
  assert.match(recs[0].notes, /Possible recent infection/);
  assert.equal(buildPatientRecords({ testName: "X", isCritical: true, measuredValue: "9" })[0].interpretation, "critical");
  assert.deepEqual(buildPatientRecords({ testName: "X" }), []);
});
