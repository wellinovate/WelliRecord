import test from "node:test";
import assert from "node:assert/strict";
import { cleanVisitFields, joinState, joinWindow, sideFor } from "../telehealth_logic.js";

const start = new Date("2026-11-02T10:00:00Z");
const appt = { patientId: "p1", organizationId: "o1", visitType: "virtual", status: "booked", scheduledFor: start, durationMin: 30 };
const min = (n) => start.getTime() + n * 60_000;

test("join window opens 10 minutes early and closes an hour after the end", () => {
  assert.equal(joinWindow(start, 30, min(-11)).open, false);
  assert.equal(joinWindow(start, 30, min(-10)).open, true);
  assert.equal(joinWindow(start, 30, min(90)).open, true);
  assert.equal(joinWindow(start, 30, min(91)).open, false);
});

test("sides: patient by profile, provider by organization", () => {
  assert.equal(sideFor(appt, { profileId: "p1", accountType: "user" }), "patient");
  assert.equal(sideFor(appt, { accountType: "organization", organizationId: "o1" }), "provider");
  assert.equal(sideFor(appt, { accountType: "user", profileId: "x", organizationId: "o1" }), "provider");
  assert.equal(sideFor(appt, { profileId: "x", accountType: "user" }), null);
  assert.equal(sideFor(appt, { accountType: "organization", profileId: "p1", organizationId: "zz" }), null);
});

test("joinState refuses strangers, in-person, closed and out-of-window visits", () => {
  assert.equal(joinState(appt, null, min(0)).code, "NOT_PARTICIPANT");
  assert.equal(joinState({ ...appt, visitType: "in_person" }, "patient", min(0)).code, "NOT_VIRTUAL");
  assert.equal(joinState({ ...appt, status: "cancelled" }, "patient", min(0)).code, "VISIT_CLOSED");
  assert.equal(joinState(appt, "patient", min(-30)).code, "TOO_EARLY");
  assert.equal(joinState(appt, "patient", min(200)).code, "WINDOW_CLOSED");
  assert.equal(joinState(appt, "provider", min(0)).ok, true);
});

test("cleanVisitFields", () => {
  assert.deepEqual(cleanVisitFields({ visitType: "virtual", durationMin: "45" }), { ok: true, value: { visitType: "virtual", durationMin: 45 } });
  assert.equal(cleanVisitFields({ visitType: "phone" }).ok, false);
  assert.equal(cleanVisitFields({ durationMin: 2 }).ok, false);
  assert.deepEqual(cleanVisitFields({}), { ok: true, value: {} });
});
