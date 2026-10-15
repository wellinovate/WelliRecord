import test from "node:test";
import assert from "node:assert/strict";

// A wrong import here stops the whole server from starting, so check it loads.
test("the WelliPay partner routes module loads and exports a router", async () => {
  // The email client refuses to start without a key. A dummy is enough to load the module.
  process.env.RESEND_API_KEY ||= "re_test_key_for_load_check";
  const mod = await import("../wellipay_partner_routes.js");
  assert.equal(typeof mod.default, "function");
  assert.ok(Array.isArray(mod.default.stack));
});
