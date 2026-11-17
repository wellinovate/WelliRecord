import test from "node:test";
import assert from "node:assert/strict";
import { STAGES, TRANSITIONS, canTransition, canEnterResult, canVerify, isSelfVerified, generateBarcode } from "../lab_order_rules.js";

test("every stage has a transition entry", () => {
  for (const s of STAGES) assert.ok(Array.isArray(TRANSITIONS[s]), s);
});

test("stages move forward one step", () => {
  assert.equal(canTransition("requested", "collected"), true);
  assert.equal(canTransition("collected", "received"), true);
  assert.equal(canTransition("received", "processing"), true);
  assert.equal(canTransition("processing", "quality-control"), true);
});

test("stages cannot be skipped or reversed", () => {
  assert.equal(canTransition("requested", "processing"), false);
  assert.equal(canTransition("requested", "delivered"), false);
  assert.equal(canTransition("received", "collected"), false);
  assert.equal(canTransition("delivered", "released"), false);
});

test("verified is never reached through the status route", () => {
  for (const s of STAGES) assert.equal(canTransition(s, "verified"), false, s);
});

test("only a verified result can be released, then delivered", () => {
  assert.equal(canTransition("quality-control", "released"), false);
  assert.equal(canTransition("verified", "released"), true);
  assert.equal(canTransition("released", "delivered"), true);
});

test("quality control can send the run back to processing", () => {
  assert.equal(canTransition("quality-control", "processing"), true);
});

test("rejected and cancelled are final, and cannot follow a verified result", () => {
  assert.deepEqual(TRANSITIONS.rejected, []);
  assert.deepEqual(TRANSITIONS.cancelled, []);
  assert.equal(canTransition("verified", "cancelled"), false);
  assert.equal(canTransition("verified", "rejected"), false);
});

test("a result is entered only while processing or in quality control", () => {
  assert.equal(canEnterResult("processing"), true);
  assert.equal(canEnterResult("quality-control"), true);
  for (const s of ["requested", "collected", "received", "verified", "released", "delivered", "rejected", "cancelled"]) {
    assert.equal(canEnterResult(s), false, s);
  }
});

test("verify needs an entered result waiting in quality control", () => {
  assert.equal(canVerify({ status: "quality-control", measuredValue: "5.2" }), true);
  assert.equal(canVerify({ status: "quality-control", measuredValue: "" }), false);
  assert.equal(canVerify({ status: "processing", measuredValue: "5.2" }), false);
  assert.equal(canVerify({ status: "verified", measuredValue: "5.2" }), false);
  assert.equal(canVerify(null), false);
});

test("self verification is detected from user ids", () => {
  assert.equal(isSelfVerified("u1", "u1"), true);
  assert.equal(isSelfVerified("u1", "u2"), false);
  assert.equal(isSelfVerified("", "u2"), false);
  assert.equal(isSelfVerified("u1", ""), false);
});

test("barcodes are unique and well formed", () => {
  const set = new Set();
  for (let i = 0; i < 5000; i++) set.add(generateBarcode());
  assert.equal(set.size, 5000);
  assert.match(generateBarcode(), /^LB-[0-9A-F]{10}$/);
});
