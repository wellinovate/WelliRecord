import test from "node:test";
import assert from "node:assert/strict";
import { webGateOn, setWebGate, assertProviderEligible } from "../web_gate.js";

const on = { PROVIDER_VERIFICATION_ENFORCE_WEB: "true" };

test("flag is off unless exactly true", () => {
  assert.equal(webGateOn({}), false);
  assert.equal(webGateOn({ PROVIDER_VERIFICATION_ENFORCE_WEB: "1" }), false);
  assert.equal(webGateOn({ PROVIDER_VERIFICATION_ENFORCE_WEB: "TRUE" }), true);
});

test("off: allows without touching the gate", async () => {
  setWebGate(null);
  assert.deepEqual(await assertProviderEligible({ sub: "u1" }, "start_consultation", {}, {}), { skipped: true });
});

test("on and not wired: fails closed with 503", async () => {
  setWebGate(null);
  await assert.rejects(assertProviderEligible({ sub: "u1" }, "start_consultation", {}, on), (e) => e.statusCode === 503);
});

test("on: eligible passes, ineligible is 403, and the staff id is passed through", async () => {
  const calls = [];
  setWebGate({ canPerform: async (ref, action, ctx) => { calls.push([ref, action, ctx]); return { eligible: ref.staffUserId === "ok" }; } });
  await assertProviderEligible({ sub: "ok" }, "start_consultation", { facilityId: "f" }, on);
  await assert.rejects(assertProviderEligible({ sub: "no" }, "start_consultation", {}, on), (e) => e.statusCode === 403 && e.code === "PROVIDER_NOT_VERIFIED");
  assert.deepEqual(calls[0], [{ staffUserId: "ok" }, "start_consultation", { facilityId: "f" }]);
});

test("on: a missing user id is not eligible", async () => {
  setWebGate({ canPerform: async (ref) => ({ eligible: ref.staffUserId !== "" }) });
  await assert.rejects(assertProviderEligible(undefined, "start_consultation", {}, on), (e) => e.statusCode === 403);
});
