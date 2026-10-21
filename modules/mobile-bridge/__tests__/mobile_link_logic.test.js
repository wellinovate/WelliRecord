import test from "node:test";
import assert from "node:assert/strict";
import { CODE_LENGTH, cleanMobileId, hashCode, newLinkCode, normalizeCode, phoneAppointment, validCode } from "../mobile_link_logic.js";

test("codes are 8 characters from a clean alphabet and validate after normalising", () => {
  for (let i = 0; i < 50; i++) {
    const c = newLinkCode();
    assert.equal(c.length, CODE_LENGTH);
    assert.ok(validCode(c));
    assert.ok(!/[01OIL]/.test(c));
  }
  assert.equal(normalizeCode(" ab-cd 23 45 "), "ABCD2345");
  assert.equal(validCode("abcd-2345"), true);
  assert.equal(validCode("ABCD0123"), false); // 0 and 1 are not in the alphabet
  assert.equal(validCode("SHORT"), false);
});

test("the hash ignores case and punctuation and depends on the secret", () => {
  assert.equal(hashCode("abcd-2345", "s".repeat(32)), hashCode("ABCD2345", "s".repeat(32)));
  assert.notEqual(hashCode("ABCD2345", "s".repeat(32)), hashCode("ABCD2345", "t".repeat(32)));
});

test("mobile ids are kept only in a safe shape", () => {
  assert.equal(cleanMobileId("64f1a2b3c4d5e6f708192a3b"), "64f1a2b3c4d5e6f708192a3b");
  assert.equal(cleanMobileId("../etc"), null);
  assert.equal(cleanMobileId({ $ne: 1 }), null);
  assert.equal(cleanMobileId(""), null);
});

test("phone appointment shows the join window", () => {
  const a = phoneAppointment({ _id: "a1", scheduledFor: "2026-11-02T10:00:00Z", durationMin: 30, status: "booked", visitType: "virtual" }, "Clinic");
  assert.equal(a.joinOpensAt, "2026-11-02T09:50:00.000Z");
  assert.equal(a.joinClosesAt, "2026-11-02T11:30:00.000Z");
  assert.equal(a.organizationName, "Clinic");
});
