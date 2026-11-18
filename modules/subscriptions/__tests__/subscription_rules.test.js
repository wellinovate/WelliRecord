import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionState, describeSubscription, nextPeriodEnd, noticesDue, clampGraceDays, cleanSubscriptionInput, graceEndsAt } from "../subscription_rules.js";

const d = (s) => new Date(s);
const sub = { periodEnd: d("2026-12-01T00:00:00Z"), graceDays: 5 };

test("grace days stay between 3 and 5", () => {
  assert.equal(clampGraceDays(1), 3);
  assert.equal(clampGraceDays(9), 5);
  assert.equal(clampGraceDays("x"), 5);
  assert.equal(clampGraceDays(4), 4);
});

test("state follows the dates", () => {
  assert.equal(subscriptionState(sub, d("2026-11-30T00:00:00Z")), "active");
  assert.equal(subscriptionState(sub, d("2026-12-03T00:00:00Z")), "grace");
  assert.equal(subscriptionState(sub, d("2026-12-06T00:00:00Z")), "grace");
  assert.equal(subscriptionState(sub, d("2026-12-06T00:00:01Z")), "suspended");
});

test("no record or exempt is never blocked", () => {
  assert.equal(subscriptionState(null), "none");
  assert.equal(subscriptionState({ ...sub, exempt: true }, d("2030-01-01")), "none");
});

test("a shorter grace period suspends sooner", () => {
  const s = { ...sub, graceDays: 3 };
  assert.equal(graceEndsAt(s).toISOString(), "2026-12-04T00:00:00.000Z");
  assert.equal(subscriptionState(s, d("2026-12-05T00:00:00Z")), "suspended");
});

test("days left counts to the end of the current stage", () => {
  assert.equal(describeSubscription(sub, d("2026-11-28T00:00:00Z")).daysLeft, 3);
  assert.equal(describeSubscription(sub, d("2026-12-02T00:00:00Z")).daysLeft, 4);
  assert.equal(describeSubscription(sub, d("2026-12-20T00:00:00Z")).daysLeft, 0);
});

test("paying in grace continues from the old end; paying after suspension starts today", () => {
  assert.equal(nextPeriodEnd(sub, 1, d("2026-12-03T00:00:00Z")).toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(nextPeriodEnd(sub, 1, d("2026-12-20T00:00:00Z")).toISOString(), "2027-01-20T00:00:00.000Z");
});

test("month end dates do not overflow", () => {
  const s = { periodEnd: d("2026-01-31T00:00:00Z"), graceDays: 5 };
  assert.equal(nextPeriodEnd(s, 1, d("2026-01-15T00:00:00Z")).toISOString(), "2026-02-28T00:00:00.000Z");
  assert.throws(() => nextPeriodEnd(s, 0));
});

test("each notice is due once per period", () => {
  const stamp = sub.periodEnd.toISOString();
  assert.deepEqual(noticesDue(sub, d("2026-11-30")), []);
  assert.deepEqual(noticesDue(sub, d("2026-12-02")), ["ended"]);
  assert.deepEqual(noticesDue({ ...sub, endedNoticeFor: stamp }, d("2026-12-02")), []);
  assert.deepEqual(noticesDue({ ...sub, endedNoticeFor: stamp }, d("2026-12-09")), ["suspended"]);
  assert.deepEqual(noticesDue(sub, d("2026-12-09")), ["ended", "suspended"]);
  // A new paid period resets the stamps by changing the period end.
  assert.deepEqual(noticesDue({ ...sub, periodEnd: d("2027-01-01"), endedNoticeFor: stamp, suspendedNoticeFor: stamp }, d("2026-12-09")), []);
});

test("admin input is validated", () => {
  assert.ok(cleanSubscriptionInput({ graceDays: 7 }).errors.length);
  assert.ok(cleanSubscriptionInput({ amountKobo: -5 }).errors.length);
  assert.ok(cleanSubscriptionInput({ periodEnd: "nope" }).errors.length);
  const ok = cleanSubscriptionInput({ plan: " Clinic ", amountKobo: 500000, graceDays: 3, periodEnd: "2026-12-01" });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.value.plan, "Clinic");
});

import { PLANS, planForOrgType, trialSubscriptionFields } from "../subscription_rules.js";

test("prices are flat per year in kobo", () => {
  assert.equal(PLANS.laboratory.amountKobo, 10_000_000);
  assert.equal(PLANS.standard.amountKobo, 5_000_000);
  assert.equal(PLANS.laboratory.months, 12);
  assert.equal(PLANS.standard.months, 12);
});

test("labs get the laboratory plan, other providers the standard plan, non-providers none", () => {
  assert.equal(planForOrgType("diagnostic").key, "laboratory");
  for (const t of ["healthcare_provider", "pharmacy", "individaul_provider"]) assert.equal(planForOrgType(t).key, "standard");
  for (const t of ["insurance", "government", "ngo", "vendor", "other", "healthtech", "telehealth"]) assert.equal(planForOrgType(t), null);
});

test("standard providers get a 30-day trial; labs start on first payment", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  const t = trialSubscriptionFields(PLANS.standard, now);
  assert.equal(t.periodEnd.toISOString(), "2026-12-18T00:00:00.000Z");
  assert.equal(t.trial, true);
  assert.equal(trialSubscriptionFields(PLANS.laboratory, now), null);
  assert.equal(trialSubscriptionFields(null, now), null);
});

test("a plan key sets the name and price unless the amount is given", () => {
  const r = cleanSubscriptionInput({ planKey: "laboratory" });
  assert.equal(r.value.amountKobo, 10_000_000);
  assert.ok(cleanSubscriptionInput({ planKey: "gold" }).errors.length);
});

test("a trial lapses like any subscription: 30 days, then grace, then suspended", () => {
  const t = trialSubscriptionFields(PLANS.standard, new Date("2026-11-18T00:00:00Z"));
  const s = { ...t, graceDays: 5 };
  assert.equal(subscriptionState(s, new Date("2026-12-10T00:00:00Z")), "active");
  assert.equal(subscriptionState(s, new Date("2026-12-20T00:00:00Z")), "grace");
  assert.equal(subscriptionState(s, new Date("2026-12-24T00:00:00Z")), "suspended");
});
