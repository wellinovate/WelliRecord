import test from "node:test";
import assert from "node:assert/strict";
import { canReview, canRelease, canEditNote, reviewerConflict, cleanReview, cleanNote, statusChangeError } from "../radiology_review_rules.js";

const written = { status: "reported", report: { findings: "Clear lungs", reportedBy: "u1" } };

test("only a written, unapproved report can be reviewed", () => {
  assert.equal(canReview(written), true);
  assert.equal(canReview({ ...written, review: { state: "approved" } }), false);
  assert.equal(canReview({ status: "images-uploaded", report: { findings: "x" } }), false);
  assert.equal(canReview({ status: "reported", report: {} }), false);
});

test("release needs approval and happens once", () => {
  assert.equal(canRelease(written), false);
  assert.equal(canRelease({ ...written, review: { state: "approved" } }), true);
  assert.equal(canRelease({ ...written, review: { state: "approved" }, releasedAt: new Date() }), false);
});

test("the writer cannot approve their own report", () => {
  assert.equal(reviewerConflict(written, "u1"), true);
  assert.equal(reviewerConflict(written, "u2"), false);
  assert.equal(reviewerConflict(written, ""), false);
});

test("a return needs a reason, an approval does not", () => {
  assert.ok(cleanReview({ decision: "return", comment: "no" }).errors.length > 0);
  assert.equal(cleanReview({ decision: "return", comment: "Left side not described" }).errors.length, 0);
  assert.equal(cleanReview({ decision: "approve" }).errors.length, 0);
  assert.ok(cleanReview({ decision: "maybe" }).errors.length > 0);
});

test("notes are trimmed and typed; notes stop after release stage", () => {
  assert.deepEqual(cleanNote({ text: "  Drink water  ", issueType: "preparation" }), { text: "Drink water", issueType: "preparation" });
  assert.equal(cleanNote({ text: "x", issueType: "bogus" }).issueType, "other");
  assert.equal(cleanNote({ text: "a".repeat(900) }).text.length, 600);
  assert.equal(canEditNote({ status: "delivered" }), false);
  assert.equal(canEditNote({ status: "reported" }), true);
});

test("status cannot jump past the report or the release", () => {
  assert.ok(statusChangeError("reported"));
  assert.ok(statusChangeError("delivered"));
  assert.equal(statusChangeError("scheduled"), null);
});
