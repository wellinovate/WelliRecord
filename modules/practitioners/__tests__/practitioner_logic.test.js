import test from "node:test";
import assert from "node:assert/strict";
import { cleanPractitionerInput, practiceDisplayName, needsReverification } from "../practitioner_logic.js";

const good = { profession: "lab_scientist", licenseNumber: " MLSCN/12345 ", licenseBody: "MLSCN" };

test("a complete signup is accepted and trimmed", () => {
  const r = cleanPractitionerInput({ ...good, specialty: " Haematology ", yearsExperience: "6" });
  assert.equal(r.ok, true);
  assert.equal(r.value.licenseNumber, "MLSCN/12345");
  assert.equal(r.value.specialty, "Haematology");
  assert.equal(r.value.yearsExperience, 6);
});

test("an unknown profession, short licence or missing body are refused", () => {
  const r = cleanPractitionerInput({ profession: "wizard", licenseNumber: "1" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.profession && r.errors.licenseNumber && r.errors.licenseBody);
});

test("years of experience must be a whole number from 0 to 70", () => {
  assert.equal(cleanPractitionerInput({ ...good, yearsExperience: -1 }).ok, false);
  assert.equal(cleanPractitionerInput({ ...good, yearsExperience: 2.5 }).ok, false);
  assert.equal(cleanPractitionerInput({ ...good, yearsExperience: 71 }).ok, false);
});

test("a partial update checks only what was sent", () => {
  assert.deepEqual(cleanPractitionerInput({ bio: " hello " }, { partial: true }), { ok: true, value: { bio: "hello" } });
  assert.equal(cleanPractitionerInput({ licenseNumber: "x" }, { partial: true }).ok, false);
});

test("the display name uses the practice name, then Dr for doctors", () => {
  assert.equal(practiceDisplayName({ practiceName: "Ada Care Labs", fullName: "Ada Obi", profession: "lab_scientist" }), "Ada Care Labs");
  assert.equal(practiceDisplayName({ fullName: "Ada Obi", profession: "doctor" }), "Dr Ada Obi");
  assert.equal(practiceDisplayName({ fullName: "Dr. Ada Obi", profession: "doctor" }), "Dr Ada Obi");
  assert.equal(practiceDisplayName({ fullName: "Ada Obi", profession: "nurse" }), "Ada Obi");
});

test("changing the licence puts an approved practitioner back in review; changing the bio does not", () => {
  const before = { verificationStatus: "approved", profession: "doctor", licenseNumber: "A1", licenseBody: "MDCN" };
  assert.equal(needsReverification(before, { licenseNumber: "B2" }), true);
  assert.equal(needsReverification(before, { profession: "nurse" }), true);
  assert.equal(needsReverification(before, { bio: "new" }), false);
  assert.equal(needsReverification(before, { licenseNumber: "A1" }), false);
  assert.equal(needsReverification({ ...before, verificationStatus: "pending" }, { licenseNumber: "B2" }), false);
});
