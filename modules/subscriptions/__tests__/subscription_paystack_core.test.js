import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildReference, parseReference, validSignature, checkVerifiedTransaction } from "../subscription_paystack_core.js";

const org = "64b7f0c2a1b2c3d4e5f60718";

test("reference carries the organisation and parses back", () => {
  const ref = buildReference(org);
  assert.match(ref, /^ws-[0-9a-f]{24}-[0-9a-f]{8}$/);
  assert.equal(parseReference(ref), org);
  assert.equal(parseReference("wo-123-abc"), null);
  assert.equal(parseReference(""), null);
});

test("signature is HMAC-SHA512 of the raw body", () => {
  const body = Buffer.from('{"event":"charge.success"}');
  const sig = crypto.createHmac("sha512", "sk_test").update(body).digest("hex");
  assert.equal(validSignature(body, sig, "sk_test"), true);
  assert.equal(validSignature(body, sig, "other"), false);
  assert.equal(validSignature(body, "abc", "sk_test"), false);
  assert.equal(validSignature(body, "", "sk_test"), false);
  assert.equal(validSignature(body, sig, ""), false);
});

test("a verified transaction must be successful, matching, in naira and fully paid", () => {
  const ref = buildReference(org);
  const tx = { status: "success", reference: ref, currency: "NGN", amount: 5_000_000 };
  assert.equal(checkVerifiedTransaction(tx, { reference: ref, expectedKobo: 5_000_000 }).ok, true);
  assert.equal(checkVerifiedTransaction({ ...tx, status: "failed" }, { reference: ref, expectedKobo: 5_000_000 }).reason, "not_successful");
  assert.equal(checkVerifiedTransaction({ ...tx, amount: 4_999_999 }, { reference: ref, expectedKobo: 5_000_000 }).reason, "underpaid");
  assert.equal(checkVerifiedTransaction({ ...tx, currency: "USD" }, { reference: ref, expectedKobo: 5_000_000 }).reason, "wrong_currency");
  assert.equal(checkVerifiedTransaction({ ...tx, reference: "x" }, { reference: ref, expectedKobo: 5_000_000 }).reason, "reference_mismatch");
  assert.equal(checkVerifiedTransaction(null, { reference: ref, expectedKobo: 1 }).ok, false);
});
