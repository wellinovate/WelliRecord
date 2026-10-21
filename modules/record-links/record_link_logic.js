// Rules for linking a hospital's existing patient record to a WelliRecord account.
// Pure functions only (no database, no network) so they can be tested on their own.
//
// The idea: creating or holding an account never grants access to a hospital record. A link
// moves through verification, consent and hospital release in that order, and imported data
// stays hidden until the last step.

import crypto from "crypto";

export const STATUSES = [
  "not_initiated",
  "awaiting_patient_verification",
  "awaiting_consent",
  "under_hospital_review",
  "linking_in_progress",
  "linked",
  "action_required",
  "cancelled", // withdrawn by the hospital or the patient
];

const TRANSITIONS = {
  not_initiated: ["awaiting_patient_verification", "cancelled"],
  awaiting_patient_verification: ["awaiting_consent", "action_required", "cancelled"],
  awaiting_consent: ["under_hospital_review", "action_required", "cancelled"],
  under_hospital_review: ["linking_in_progress", "action_required", "cancelled"],
  linking_in_progress: ["linked", "action_required"],
  action_required: ["awaiting_patient_verification", "under_hospital_review", "cancelled"],
  linked: [],
  cancelled: [],
};

export const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);
export const isOpen = (status) => !["linked", "cancelled"].includes(status);

export const CONSENT_VERSION = "draft-1"; // wording has not had a legal review
export const CONSENT_SCOPES = ["demographics", "allergies", "medications"];

export const LINK_TTL_MS = 14 * 24 * 3600 * 1000;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_SENDS_PER_HOUR = 3;
export const OTP_MAX_ATTEMPTS = 5; // per code
export const OTP_LOCK_MS = 15 * 60 * 1000;
export const OTP_LIFETIME_FAILS = 15; // then the link needs hospital attention
export const MAX_STAGED_ITEMS = 100;

// ----- secrets -----

export const newToken = () => crypto.randomBytes(24).toString("base64url");

export const hashSecret = (secret, key) =>
  crypto.createHmac("sha256", String(key)).update(String(secret)).digest("hex");

export const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

export const hashOtp = (code, linkId, key) => hashSecret(`otp:${linkId}:${String(code).trim()}`, key);

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

export const validOtpFormat = (code) => typeof code === "string" && /^\d{6}$/.test(code.trim());

// ----- OTP limits -----

/** link has otpSendTimes (Date[]), otpLockedUntil (Date|null). */
export function canSendOtp(link, now = Date.now()) {
  const locked = link.otpLockedUntil ? new Date(link.otpLockedUntil).getTime() : 0;
  if (locked > now) return { ok: false, reason: "locked", retryAt: new Date(locked) };
  const recent = (link.otpSendTimes || []).map((d) => new Date(d).getTime()).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    return { ok: false, reason: "too_many_sends", retryAt: new Date(Math.min(...recent) + 3600 * 1000) };
  }
  return { ok: true };
}

/** After a wrong code. Returns the new counters and whether the link must go to the hospital. */
export function afterWrongOtp({ attempts = 0, lifetimeFails = 0 }, now = Date.now()) {
  const a = attempts + 1;
  const total = lifetimeFails + 1;
  const lock = a >= OTP_MAX_ATTEMPTS;
  return {
    attempts: lock ? 0 : a,
    lifetimeFails: total,
    lockedUntil: lock ? new Date(now + OTP_LOCK_MS) : null,
    escalate: total >= OTP_LIFETIME_FAILS,
  };
}

export const otpLocked = (link, now = Date.now()) =>
  Boolean(link.otpLockedUntil && new Date(link.otpLockedUntil).getTime() > now);

export const linkExpired = (link, now = Date.now()) =>
  Boolean(link.expiresAt && new Date(link.expiresAt).getTime() <= now);

// ----- identity matching -----

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "chief", "engr", "alhaji", "alhaja", "sir", "madam"]);

export function nameTokens(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));
}

/** Order does not matter. Two shared names, or one when both sides have only one. */
export function namesMatch(a, b) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const shared = x.filter((t) => y.includes(t)).length;
  if (x.length === 1 && y.length === 1) return shared === 1;
  return shared >= 2;
}

/** Calendar date only, so a time zone shift cannot change the day. */
export function dateOnly(v) {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export const sameDate = (a, b) => {
  const x = dateOnly(a);
  const y = dateOnly(b);
  return Boolean(x && y && x === y);
};

/**
 * Hospital record vs the signed-in person's profile.
 * With a hospital date of birth, it must match. Without one, the name must match and the link is
 * flagged weak. Either way the hospital still reviews before anything is released.
 */
export function identityCheck({ hospital, claimant }) {
  const hospitalName = hospital.fullName || [hospital.firstName, hospital.lastName].filter(Boolean).join(" ");
  const nameOk = namesMatch(hospitalName, claimant.fullName);
  if (dateOnly(hospital.dob)) {
    if (!dateOnly(claimant.dob)) return { ok: false, reason: "claimant_dob_missing", nameMatched: nameOk };
    if (!sameDate(hospital.dob, claimant.dob)) return { ok: false, reason: "dob_mismatch", nameMatched: nameOk };
    return { ok: true, method: "dob", nameMatched: nameOk, weak: false };
  }
  if (nameOk) return { ok: true, method: "name", nameMatched: true, weak: true };
  return { ok: false, reason: "no_basis_to_match", nameMatched: false };
}

export function maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 7) return "";
  return `+${d.slice(0, 3)} ••• ••• ${d.slice(-4)}`;
}

// ----- consent -----

export function cleanConsent({ version, scopes }) {
  if (version !== CONSENT_VERSION) return { error: "The consent text has changed. Reload and read it again." };
  if (!Array.isArray(scopes) || !scopes.length) return { error: "Choose what to link." };
  const clean = [...new Set(scopes.map(String))];
  if (clean.some((s) => !CONSENT_SCOPES.includes(s))) return { error: "Unknown item in the consent." };
  if (!clean.includes("demographics")) return { error: "Basic details are needed to link a record." };
  return { scopes: clean };
}

// ----- staged items -----

const ALLERGY_TYPES = ["drug", "food", "environment", "insect", "other"];
const SEVERITIES = ["mild", "moderate", "severe", "life-threatening", "unknown"];
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export function cleanStagedItems(items, existingCount = 0) {
  if (!Array.isArray(items) || !items.length) return { error: "Send at least one item." };
  if (existingCount + items.length > MAX_STAGED_ITEMS) return { error: `A link can hold at most ${MAX_STAGED_ITEMS} items.` };
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    if (it.kind === "allergy") {
      const allergen = clip(it.allergen, 200);
      if (!allergen) return { error: `Item ${i + 1}: the allergen is required.` };
      out.push({
        kind: "allergy",
        data: {
          allergen,
          allergyType: ALLERGY_TYPES.includes(it.allergyType) ? it.allergyType : "other",
          reaction: clip(it.reaction, 500),
          severity: SEVERITIES.includes(it.severity) ? it.severity : "unknown",
        },
        sourceRef: clip(it.sourceRef, 80),
      });
    } else if (it.kind === "medication") {
      const medicationName = clip(it.medicationName, 200);
      if (!medicationName) return { error: `Item ${i + 1}: the medication name is required.` };
      out.push({
        kind: "medication",
        data: { medicationName, dosage: clip(it.dosage, 100), frequency: clip(it.frequency, 100), notes: clip(it.notes, 500) },
        sourceRef: clip(it.sourceRef, 80),
      });
    } else {
      return { error: `Item ${i + 1}: kind must be allergy or medication.` };
    }
  }
  return { items: out };
}

/** Only items the patient consented to are transferred. */
export const itemsInScope = (items, scopes) =>
  (items || []).filter((it) => (it.kind === "allergy" ? scopes.includes("allergies") : scopes.includes("medications")));
