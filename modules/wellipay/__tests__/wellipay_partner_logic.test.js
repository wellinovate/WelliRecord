import test from "node:test";
import assert from "node:assert/strict";
import {
  canAttempt, checkRequestAuth, generateCode, hashCode, normalizeReference, signatureFor, validCode, validRequestId, MAX_ATTEMPTS,
} from "../wellipay_partner_logic.js";

const KEY = "test-key-1234567890";
const body = JSON.stringify({ requestId: "r-12345678", reference: "WR-2291-ABCD" });
const now = 1_800_000_000;
const good = () => ({ key: KEY, authorization: `Bearer ${KEY}`, timestamp: String(now), signature: signatureFor(KEY, now, body), rawBody: body, nowSeconds: now });

test("accepts a correctly signed call", () => assert.equal(checkRequestAuth(good()).ok, true));
test("refuses when no key is configured", () => assert.equal(checkRequestAuth({ ...good(), key: "" }).status, 503));
test("refuses a wrong bearer key", () => assert.equal(checkRequestAuth({ ...good(), authorization: "Bearer nope" }).reason, "bad_key"));
test("refuses a stale timestamp", () => assert.equal(checkRequestAuth({ ...good(), nowSeconds: now + 301 }).reason, "stale"));
test("refuses a tampered body", () => assert.equal(checkRequestAuth({ ...good(), rawBody: body.replace("2291", "9999") }).reason, "bad_signature"));
test("refuses a missing signature", () => assert.equal(checkRequestAuth({ ...good(), signature: undefined }).reason, "bad_signature"));

test("normalises WR-IDs", () => {
  assert.equal(normalizeReference(" wr-2291-abcd "), "WR-2291-ABCD");
  assert.equal(normalizeReference("2291-abcd"), null);
  assert.equal(normalizeReference({ $ne: "" }), null);
});

test("codes are 6 digits", () => {
  for (let i = 0; i < 50; i++) assert.match(generateCode(), /^\d{6}$/);
  assert.equal(validCode("123456"), true);
  assert.equal(validCode("12345"), false);
  assert.equal(validCode(123456), false);
});

test("request ids are checked", () => {
  assert.equal(validRequestId("3f2a9c1e-0000-4000-8000-123456789abc"), true);
  assert.equal(validRequestId("short"), false);
  assert.equal(validRequestId("bad id with spaces"), false);
});

test("the code hash depends on key, request and code", () => {
  const a = hashCode(KEY, "r1", "123456");
  assert.notEqual(a, hashCode(KEY, "r2", "123456"));
  assert.notEqual(a, hashCode(KEY, "r1", "654321"));
  assert.notEqual(a, hashCode("other", "r1", "123456"));
});

test("attempt rules", () => {
  const future = new Date(Date.now() + 60_000);
  assert.equal(canAttempt({ consumedAt: null, expiresAt: future, attempts: 0 }), true);
  assert.equal(canAttempt({ consumedAt: new Date(), expiresAt: future, attempts: 0 }), false);
  assert.equal(canAttempt({ consumedAt: null, expiresAt: new Date(Date.now() - 1), attempts: 0 }), false);
  assert.equal(canAttempt({ consumedAt: null, expiresAt: future, attempts: MAX_ATTEMPTS }), false);
  assert.equal(canAttempt(null), false);
});
