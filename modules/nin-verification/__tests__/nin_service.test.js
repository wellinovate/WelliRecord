import test from "node:test";
import assert from "node:assert/strict";
import { NinProviderError } from "../nin_client.js";
import { verifyNin } from "../nin_service.js";

const env = { TWOAM_API_KEY: "k", TWOAM_REQUEST_REASON: "kycCheck" };
const NIN = "11111111111";
const PROFILE = { fullName: "Chinedu Ike Okafor", dateOfBirth: new Date("1990-05-14T00:00:00Z") };
const REC = { firstName: "Chinedu", lastName: "Okafor", middleName: "Ike", dateOfBirth: "1990-05-14", requestId: "REQ-1" };

function makeDeps(over = {}) {
  const calls = { lookups: 0, attempts: [], verified: [] };
  const deps = {
    getProfile: async () => ({ ...PROFILE }),
    countAttempts: async () => 0,
    countAllAttempts: async () => 0,
    recordAttempt: async (r) => { calls.attempts.push(r); },
    markVerified: async (id, at) => { calls.verified.push([id, at]); },
    lookup: async () => { calls.lookups++; return REC; },
    ...over,
  };
  return { deps, calls };
}
const run = (args, over) => {
  const { deps, calls } = makeDeps(over);
  return verifyNin({ accountId: "acc1", nin: NIN, consent: true, deps, env, ...args }).then((r) => ({ r, calls }));
};

test("a matching NIN marks the profile verified and records only the outcome", async () => {
  const { r, calls } = await run({});
  assert.equal(r.ok, true);
  assert.equal(calls.verified.length, 1);
  assert.equal(calls.attempts.length, 1);
  assert.equal(calls.attempts[0].outcome, "verified");
  assert.equal(calls.attempts[0].requestId, "REQ-1");
  const everything = JSON.stringify({ r, calls });
  assert.ok(!everything.includes(NIN), "the NIN must not appear in anything saved or returned");
});

test("a mismatch is refused, counted, and not marked verified", async () => {
  const { r, calls } = await run({}, { lookup: async () => ({ ...REC, dateOfBirth: "1991-01-01" }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "mismatch");
  assert.equal(r.status, 422);
  assert.equal(calls.verified.length, 0);
  assert.equal(calls.attempts[0].outcome, "mismatch");
  assert.ok(!/1991|chinedu|okafor/i.test(r.message), "the message must not echo NIN record data");
});

test("an unknown NIN is counted as an attempt", async () => {
  const { r, calls } = await run({}, { lookup: async () => { throw new NinProviderError("not_found", 404); } });
  assert.equal(r.code, "not_found");
  assert.equal(calls.attempts[0].outcome, "not_found");
});

test("a provider failure gives a neutral message and does not use up an attempt", async () => {
  for (const code of ["provider_down", "provider_auth", "provider_balance", "rate_limited", "bad_response"]) {
    const { r, calls } = await run({}, { lookup: async () => { throw new NinProviderError(code, 500); } });
    assert.equal(r.status, 502, code);
    assert.equal(r.code, "provider_error");
    assert.equal(calls.attempts[0].outcome, "provider_error");
    assert.ok(!/balance|key|auth/i.test(r.message), "the message must not reveal provider details");
  }
});

test("nothing is looked up when the feature is off, consent is missing, or the NIN is malformed", async () => {
  let r = await run({ env: {} });
  assert.equal(r.r.status, 503);
  assert.equal(r.calls.lookups, 0);
  r = await run({ consent: false });
  assert.equal(r.r.code, "consent_required");
  assert.equal(r.calls.lookups, 0);
  r = await run({ nin: "123" });
  assert.equal(r.r.code, "invalid_nin");
  assert.equal(r.calls.lookups, 0);
});

test("an already verified profile is not looked up again", async () => {
  const { r, calls } = await run({}, { getProfile: async () => ({ ...PROFILE, identityVerifiedAt: new Date("2026-01-01") }) });
  assert.equal(r.ok, true);
  assert.equal(r.already, true);
  assert.equal(calls.lookups, 0);
});

test("an incomplete profile is refused before any paid lookup", async () => {
  const { r, calls } = await run({}, { getProfile: async () => ({ fullName: "Chinedu" }) });
  assert.equal(r.code, "profile_incomplete");
  assert.equal(calls.lookups, 0);
});

test("three counted attempts in a day stop further lookups", async () => {
  const { r, calls } = await run({}, { countAttempts: async () => 3 });
  assert.equal(r.status, 429);
  assert.equal(calls.lookups, 0);
});

test("the daily cap across all accounts stops lookups", async () => {
  const { r, calls } = await run({ env: { ...env, TWOAM_DAILY_LIMIT: "5" } }, { countAllAttempts: async () => 5 });
  assert.equal(r.status, 503);
  assert.equal(calls.lookups, 0);
});

test("a missing profile is a 404", async () => {
  const { r } = await run({}, { getProfile: async () => null });
  assert.equal(r.status, 404);
});
