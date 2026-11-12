import test from "node:test";
import assert from "node:assert/strict";
import { NinProviderError, lookupNin, ninConfig } from "../nin_client.js";

const env = { TWOAM_API_KEY: "test-key-123", TWOAM_REQUEST_REASON: "kycCheck", TWOAM_API_URL: "https://example.test/" };
const FULL = {
  firstName: "Chinedu", lastName: "Okafor", middleName: "Ike", gender: "Male", dateOfBirth: "1990-05-14",
  residenceAddressLine1: "12 Allen Avenue", phone: "+2348012345678", email: "x@example.com", photo: "base64...", signature: "base64...",
  nextOfKinFirstName: "Ngozi", religion: "christianity", requestId: "REQ-9F3C2A1B", consentId: "CONSENT-4471",
};
const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test("it is off until both the key and the request reason are set", () => {
  assert.equal(ninConfig({}).enabled, false);
  assert.equal(ninConfig({ TWOAM_API_KEY: "k" }).enabled, false);
  assert.equal(ninConfig({ TWOAM_REQUEST_REASON: "r" }).enabled, false);
  assert.equal(ninConfig(env).enabled, true);
  assert.equal(ninConfig(env).baseUrl, "https://example.test");
  assert.equal(ninConfig({ TWOAM_API_KEY: "k", TWOAM_REQUEST_REASON: "r" }).baseUrl, "https://nin-api.2am.ng");
});

test("when off it never calls the network", async () => {
  let called = false;
  await assert.rejects(
    lookupNin({ nin: "11111111111", env: {}, fetchImpl: async () => { called = true; } }),
    (e) => e instanceof NinProviderError && e.code === "not_configured",
  );
  assert.equal(called, false);
});

test("it sends the documented request", async () => {
  let seen;
  await lookupNin({
    nin: "11111111111", idempotencyKey: "wr-nin-abc", env,
    fetchImpl: async (url, init) => { seen = { url, init }; return reply(200, FULL)(); },
  });
  assert.equal(seen.url, "https://example.test/v1/verify/raw-nin");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, "Bearer test-key-123");
  assert.equal(seen.init.headers["Idempotency-Key"], "wr-nin-abc");
  assert.deepEqual(JSON.parse(seen.init.body), { nin: "11111111111", requestReason: "kycCheck" });
});

test("it keeps only the fields needed to compare identity", async () => {
  const rec = await lookupNin({ nin: "11111111111", env, fetchImpl: reply(200, FULL) });
  assert.deepEqual(rec, { firstName: "Chinedu", lastName: "Okafor", middleName: "Ike", dateOfBirth: "1990-05-14", requestId: "REQ-9F3C2A1B" });
  const text = JSON.stringify(rec);
  for (const gone of ["photo", "Allen", "2348012345678", "x@example.com", "Ngozi", "signature"]) assert.ok(!text.includes(gone), gone);
});

test("HTTP statuses map to error codes", async () => {
  const cases = { 401: "provider_auth", 403: "provider_auth", 402: "provider_balance", 404: "not_found", 429: "rate_limited", 500: "provider_down", 503: "provider_down", 400: "bad_response" };
  for (const [status, code] of Object.entries(cases)) {
    await assert.rejects(lookupNin({ nin: "11111111111", env, fetchImpl: reply(Number(status), {}) }), (e) => e.code === code, status);
  }
});

test("a network failure, a bad body and a record without a name or date are errors", async () => {
  await assert.rejects(lookupNin({ nin: "11111111111", env, fetchImpl: async () => { throw new Error("boom"); } }), (e) => e.code === "provider_down");
  await assert.rejects(
    lookupNin({ nin: "11111111111", env, fetchImpl: async () => ({ status: 200, ok: true, json: async () => { throw new Error("x"); } }) }),
    (e) => e.code === "bad_response",
  );
  await assert.rejects(lookupNin({ nin: "11111111111", env, fetchImpl: reply(200, { firstName: "A" }) }), (e) => e.code === "bad_response");
});

test("errors never carry the NIN or the key", async () => {
  try {
    await lookupNin({ nin: "11111111111", env, fetchImpl: reply(401, {}) });
  } catch (e) {
    const text = JSON.stringify({ m: e.message, c: e.code, s: e.status, stack: String(e.stack) });
    assert.ok(!text.includes("11111111111"));
    assert.ok(!text.includes("test-key-123"));
  }
});
