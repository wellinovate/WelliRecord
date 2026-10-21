import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_VERSION, LINK_TTL_MS, MAX_STAGED_ITEMS, OTP_LOCK_MS, STATUSES,
  afterWrongOtp, canMove, canSendOtp, cleanConsent, cleanStagedItems, hashOtp, hashSecret,
  identityCheck, isOpen, itemsInScope, linkExpired, maskPhone, namesMatch, newOtp, newToken,
  otpLocked, safeEqual, validOtpFormat,
} from "../record_link_logic.js";

const KEY = "test-key";
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

test("statuses follow the agreed path and nothing skips consent or review", () => {
  assert.ok(canMove("awaiting_patient_verification", "awaiting_consent"));
  assert.ok(canMove("awaiting_consent", "under_hospital_review"));
  assert.ok(canMove("under_hospital_review", "linking_in_progress"));
  assert.ok(canMove("linking_in_progress", "linked"));
  assert.ok(!canMove("awaiting_patient_verification", "under_hospital_review"));
  assert.ok(!canMove("awaiting_patient_verification", "linked"));
  assert.ok(!canMove("awaiting_consent", "linking_in_progress"));
  assert.ok(!canMove("under_hospital_review", "linked"));
  assert.ok(!canMove("linked", "awaiting_consent"));
  assert.ok(!canMove("cancelled", "awaiting_patient_verification"));
  assert.ok(STATUSES.includes("action_required"));
});

test("only linked and cancelled are closed", () => {
  assert.equal(isOpen("linked"), false);
  assert.equal(isOpen("cancelled"), false);
  for (const s of STATUSES.filter((x) => !["linked", "cancelled"].includes(x))) assert.equal(isOpen(s), true, s);
});

test("tokens and codes are random, hashed and compared safely", () => {
  assert.notEqual(newToken(), newToken());
  assert.ok(newToken().length >= 30);
  assert.match(newOtp(), /^\d{6}$/);
  assert.equal(hashSecret("a", KEY), hashSecret("a", KEY));
  assert.notEqual(hashSecret("a", KEY), hashSecret("a", "other"));
  assert.notEqual(hashOtp("123456", "L1", KEY), hashOtp("123456", "L2", KEY));
  assert.ok(safeEqual(hashOtp("123456", "L1", KEY), hashOtp("123456", "L1", KEY)));
  assert.ok(!safeEqual(hashOtp("123456", "L1", KEY), hashOtp("123457", "L1", KEY)));
  assert.ok(!safeEqual("", ""));
  assert.ok(validOtpFormat("012345"));
  assert.ok(!validOtpFormat("12345"));
  assert.ok(!validOtpFormat("12345a"));
  assert.ok(!validOtpFormat(123456));
});

test("OTP: three sends an hour, then wait", () => {
  const sends = [NOW - 50 * 60000, NOW - 30 * 60000, NOW - 10 * 60000];
  const r = canSendOtp({ otpSendTimes: sends }, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too_many_sends");
  assert.equal(r.retryAt.getTime(), sends[0] + 3600 * 1000);
  assert.equal(canSendOtp({ otpSendTimes: [NOW - 2 * 3600 * 1000] }, NOW).ok, true);
});

test("OTP: five wrong codes lock the link for 15 minutes", () => {
  let s = { attempts: 0, lifetimeFails: 0 };
  let r;
  for (let i = 0; i < 4; i++) {
    r = afterWrongOtp(s, NOW);
    assert.equal(r.lockedUntil, null);
    s = r;
  }
  r = afterWrongOtp(s, NOW);
  assert.equal(r.lockedUntil.getTime(), NOW + OTP_LOCK_MS);
  assert.equal(otpLocked({ otpLockedUntil: r.lockedUntil }, NOW + 60000), true);
  assert.equal(otpLocked({ otpLockedUntil: r.lockedUntil }, NOW + OTP_LOCK_MS + 1), false);
  assert.equal(canSendOtp({ otpLockedUntil: r.lockedUntil, otpSendTimes: [] }, NOW).reason, "locked");
});

test("OTP: 15 lifetime wrong codes send the link to the hospital", () => {
  assert.equal(afterWrongOtp({ attempts: 0, lifetimeFails: 13 }, NOW).escalate, false);
  assert.equal(afterWrongOtp({ attempts: 0, lifetimeFails: 14 }, NOW).escalate, true);
});

test("links expire", () => {
  assert.equal(linkExpired({ expiresAt: new Date(NOW + LINK_TTL_MS) }, NOW), false);
  assert.equal(linkExpired({ expiresAt: new Date(NOW - 1) }, NOW), true);
});

test("name matching ignores order, titles, accents and case", () => {
  assert.ok(namesMatch("Adebayo Ola Johnson", "johnson adebayo"));
  assert.ok(namesMatch("Dr. Chinedu Okafor", "Chinedu OKAFOR"));
  assert.ok(namesMatch("Zoë Ndidi", "Zoe Ndidi"));
  assert.ok(!namesMatch("Adebayo Johnson", "Adebayo Williams"));
  assert.ok(!namesMatch("Johnson", "Adebayo Johnson"));
  assert.ok(!namesMatch("", "Adebayo Johnson"));
});

test("wrong person: right phone, different date of birth, is refused", () => {
  const r = identityCheck({
    hospital: { fullName: "Amina Bello", dob: "1990-04-12" },
    claimant: { fullName: "Amina Bello", dob: "1991-04-12" },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "dob_mismatch");
});

test("wrong person: no date of birth on the profile is refused when the hospital has one", () => {
  const r = identityCheck({ hospital: { fullName: "Amina Bello", dob: "1990-04-12" }, claimant: { fullName: "Amina Bello", dob: null } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "claimant_dob_missing");
});

test("matching date of birth passes, even if the display name differs", () => {
  const r = identityCheck({ hospital: { fullName: "Amina Bello", dob: new Date("1990-04-12T00:00:00Z") }, claimant: { fullName: "A. Yusuf", dob: "1990-04-12" } });
  assert.equal(r.ok, true);
  assert.equal(r.method, "dob");
  assert.equal(r.weak, false);
});

test("no hospital date of birth: name match passes but is flagged weak", () => {
  const ok = identityCheck({ hospital: { firstName: "Amina", lastName: "Bello" }, claimant: { fullName: "Bello Amina" } });
  assert.deepEqual([ok.ok, ok.method, ok.weak], [true, "name", true]);
  const no = identityCheck({ hospital: { firstName: "Amina", lastName: "Bello" }, claimant: { fullName: "Ngozi Eze" } });
  assert.equal(no.ok, false);
  assert.equal(no.reason, "no_basis_to_match");
});

test("phone is masked", () => {
  assert.equal(maskPhone("+2348012345678"), "+234 ••• ••• 5678");
  assert.equal(maskPhone("123"), "");
});

test("consent needs the current wording, known scopes and basic details", () => {
  assert.deepEqual(cleanConsent({ version: CONSENT_VERSION, scopes: ["demographics", "allergies", "allergies"] }).scopes, ["demographics", "allergies"]);
  assert.ok(cleanConsent({ version: "old", scopes: ["demographics"] }).error);
  assert.ok(cleanConsent({ version: CONSENT_VERSION, scopes: [] }).error);
  assert.ok(cleanConsent({ version: CONSENT_VERSION, scopes: ["allergies"] }).error);
  assert.ok(cleanConsent({ version: CONSENT_VERSION, scopes: ["demographics", "labs"] }).error);
  assert.ok(cleanConsent({ version: CONSENT_VERSION }).error);
});

test("staged items are cleaned and capped", () => {
  const r = cleanStagedItems([
    { kind: "allergy", allergen: "  Penicillin ", allergyType: "bogus", severity: "severe", sourceRef: "A-1" },
    { kind: "medication", medicationName: "Metformin", dosage: "500mg", frequency: "twice daily" },
  ]);
  assert.equal(r.items[0].data.allergen, "Penicillin");
  assert.equal(r.items[0].data.allergyType, "other");
  assert.equal(r.items[0].data.severity, "severe");
  assert.equal(r.items[1].data.dosage, "500mg");
  assert.ok(cleanStagedItems([]).error);
  assert.ok(cleanStagedItems([{ kind: "lab", name: "x" }]).error);
  assert.ok(cleanStagedItems([{ kind: "allergy", allergen: " " }]).error);
  assert.ok(cleanStagedItems([{ kind: "allergy", allergen: "x" }], MAX_STAGED_ITEMS).error);
});

test("only consented scopes are transferred", () => {
  const items = [{ kind: "allergy" }, { kind: "medication" }];
  assert.equal(itemsInScope(items, ["demographics"]).length, 0);
  assert.deepEqual(itemsInScope(items, ["demographics", "allergies"]).map((i) => i.kind), ["allergy"]);
  assert.equal(itemsInScope(items, ["demographics", "allergies", "medications"]).length, 2);
});
