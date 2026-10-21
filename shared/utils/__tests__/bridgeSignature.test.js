import test from "node:test";
import assert from "node:assert/strict";
import { bridgeSign, bridgeVerify } from "../bridgeSignature.js";

const secret = "x".repeat(40);
const req = { method: "POST", path: "/api/v1/bridge/link/claim", body: { code: "ABCD1234", mobileAccountId: "m1" } };

test("a signed request verifies", () => {
  const headers = bridgeSign({ secret, ...req });
  assert.equal(bridgeVerify({ secret, ...req, headers }).ok, true);
});

test("changing the body, path, method or secret fails", () => {
  const headers = bridgeSign({ secret, ...req });
  assert.equal(bridgeVerify({ secret, ...req, body: { ...req.body, code: "ZZZZ9999" }, headers }).ok, false);
  assert.equal(bridgeVerify({ secret, ...req, path: "/api/v1/bridge/link/revoke", headers }).ok, false);
  assert.equal(bridgeVerify({ secret, ...req, method: "GET", headers }).ok, false);
  assert.equal(bridgeVerify({ secret: "y".repeat(40), ...req, headers }).ok, false);
});

test("old requests and repeated nonces are refused", () => {
  const ts = Date.now() - 6 * 60 * 1000;
  const old = bridgeSign({ secret, ...req, ts });
  assert.equal(bridgeVerify({ secret, ...req, headers: old }).reason, "stale");
  const seen = new Map();
  const h = bridgeSign({ secret, ...req });
  assert.equal(bridgeVerify({ secret, ...req, headers: h, seen }).ok, true);
  assert.equal(bridgeVerify({ secret, ...req, headers: h, seen }).reason, "replayed");
});

test("a short or missing secret switches the bridge off", () => {
  const headers = bridgeSign({ secret, ...req });
  assert.equal(bridgeVerify({ secret: "short", ...req, headers }).reason, "not_configured");
  assert.equal(bridgeVerify({ secret: "", ...req, headers }).reason, "not_configured");
});
