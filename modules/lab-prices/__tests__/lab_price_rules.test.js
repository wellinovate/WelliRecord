import test from "node:test";
import assert from "node:assert/strict";
import { priceKey, cleanPrice, resolvePrice } from "../lab_price_rules.js";

test("catalog tests key by testKey, others by lower-cased name", () => {
  assert.equal(priceKey("fbc", "Full Blood Count"), "k:fbc");
  assert.equal(priceKey("", "  Full  Blood COUNT "), "n:full blood count");
});

test("a price needs a test and a sensible amount", () => {
  assert.ok(cleanPrice({ price: 5000 }).errors.length > 0);
  assert.ok(cleanPrice({ testName: "FBC", price: -1 }).errors.length > 0);
  assert.ok(cleanPrice({ testName: "FBC", price: "abc" }).errors.length > 0);
  const ok = cleanPrice({ testName: "FBC", testKey: "fbc", price: "4500.555" });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.value.price, 4500.56);
  assert.equal(ok.value.key, "k:fbc");
});

test("typed price wins, then the list, then zero", () => {
  const list = [{ key: "k:fbc", price: 4500 }, { key: "n:widal", price: 3000 }];
  assert.equal(resolvePrice(7000, list, "fbc", "FBC"), 7000);
  assert.equal(resolvePrice(0, list, "fbc", "FBC"), 4500);
  assert.equal(resolvePrice(undefined, list, "", "Widal"), 3000);
  assert.equal(resolvePrice(0, list, "fbc2", "Widal"), 3000);
  assert.equal(resolvePrice(0, list, "", "Unknown"), 0);
});
