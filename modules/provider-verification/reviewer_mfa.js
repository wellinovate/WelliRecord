// Second sign-in step for reviewer roles (reviewer, senior_reviewer, compliance_admin).
//
// The website's login is not changed. A reviewer signs in as usual, then proves a second factor and gets a short-lived
// "step-up" token, sent as the x-step-up-token header. Every reviewer route (requireStaff) refuses without one.
// There is no switch to turn this off: a reviewer without the step cannot reach reviewer routes, only the MFA routes below.
import crypto from "crypto";
import jwt from "jsonwebtoken";
import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { openSecret, sealSecret, newSecret, otpauthUrl, verifyTotp, stepFor, newRecoveryCodes, hashRecovery, normaliseRecovery } from "./reviewer_totp.js";

export const MAX_WRONG = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const STEP_UP_TTL = "2h";
const ISS = "wellirecord-reviewer-stepup";

const MfaSchema = new mongoose.Schema({
  accountId: { type: String, required: true, unique: true, index: true },
  sealedSecret: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  nonce: { type: String }, // changes on every enrolment, so tokens from before a reset stop working
  lastStep: { type: Number, default: -1 },
  recoveryHashes: { type: [String], default: [] },
  wrong: { type: Number, default: 0 },
  lockedUntil: { type: Date },
}, { timestamps: true, collection: "pv_mfa" });
export const PvMfa = mongoose.models.PvMfa || mongoose.model("PvMfa", MfaSchema);

/** Mongo-backed store. Tests pass an in-memory one with the same four methods. */
export const mongoStore = {
  find: async (accountId) => PvMfa.findOne({ accountId: String(accountId) }).lean(),
  save: async (doc) => { await PvMfa.replaceOne({ accountId: doc.accountId }, doc, { upsert: true }); },
  remove: async (accountId) => { await PvMfa.deleteOne({ accountId: String(accountId) }); },
};

export const mfaRequired = () => String(process.env.REVIEWER_MFA_REQUIRED ?? "true").toLowerCase() !== "false";

/**
 * @param {{store: typeof mongoStore, now?: () => number, secretKey?: () => string, signKey?: () => string}} deps
 */
export function createReviewerMfa({ store = mongoStore, now = () => Date.now(), secretKey = () => process.env.MFA_SECRET_KEY || process.env.JWT_SECRET_KEY, signKey = () => process.env.JWT_SECRET_KEY } = {}) {
  const sk = () => { const k = secretKey(); if (!k) throw new Error("No key to seal reviewer second-step secrets"); return k; };
  const stepUpKey = () => crypto.createHash("sha256").update(`pv-stepup-v1:${signKey()}`).digest();
  const issue = (accountId, nonce) => jwt.sign({ sub: String(accountId), purpose: "pv_stepup", nonce }, stepUpKey(), { issuer: ISS, expiresIn: STEP_UP_TTL });

  const fail = (code, message, status = 403, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
  const lockedLeft = (d) => (d?.lockedUntil && new Date(d.lockedUntil).getTime() > now() ? new Date(d.lockedUntil).getTime() - now() : 0);

  return {
    async status(accountId) {
      const d = await store.find(accountId);
      return { enabled: Boolean(d?.enabled), recoveryLeft: d?.enabled ? d.recoveryHashes.length : 0 };
    },

    /** Starts (or restarts) enrolment. Refused once the step is on: a reset by a compliance admin is the way to start over. */
    async setup(accountId, label) {
      const d = await store.find(accountId);
      if (d?.enabled) throw fail("mfa_already_enabled", "The second step is already on. Ask a compliance admin to reset it.", 409);
      const secret = newSecret();
      await store.save({ accountId: String(accountId), sealedSecret: sealSecret(sk(), secret), enabled: false, nonce: "", lastStep: -1, recoveryHashes: [], wrong: 0 });
      return { secret, otpauthUrl: otpauthUrl(secret, label || String(accountId)) };
    },

    /** Confirms the first code, turns the step on, returns the recovery codes once and a step-up token. */
    async enable(accountId, code) {
      const d = await store.find(accountId);
      if (!d || d.enabled) throw fail("mfa_not_pending", "Start the setup first.", 409);
      if (lockedLeft(d)) throw fail("mfa_locked", "Too many wrong codes. Try again in a few minutes.", 429);
      const secret = openSecret(sk(), d.sealedSecret);
      const step = secret ? verifyTotp(secret, code, now(), -1) : null;
      if (step === null) {
        await this._wrong(d);
        throw fail("mfa_bad_code", "That code is not right.", 400);
      }
      const recovery = newRecoveryCodes(8);
      const nonce = crypto.randomBytes(12).toString("hex");
      await store.save({ ...d, enabled: true, nonce, lastStep: step, recoveryHashes: recovery.map((c) => hashRecovery(sk(), c)), wrong: 0, lockedUntil: undefined });
      return { recoveryCodes: recovery, stepUpToken: issue(accountId, nonce) };
    },

    /** Second step at sign-in: an authenticator code or a single-use recovery code. Returns a step-up token. */
    async verify(accountId, { code, recoveryCode } = {}) {
      const d = await store.find(accountId);
      if (!d?.enabled) throw fail("mfa_enrol_required", "Set up the second step first.", 403);
      if (lockedLeft(d)) throw fail("mfa_locked", "Too many wrong codes. Try again in a few minutes.", 429);
      if (recoveryCode) {
        const h = hashRecovery(sk(), recoveryCode);
        const idx = d.recoveryHashes.indexOf(h);
        if (normaliseRecovery(recoveryCode).length !== 10 || idx < 0) { await this._wrong(d); throw fail("mfa_bad_code", "That code is not right.", 400); }
        const left = d.recoveryHashes.filter((_, i) => i !== idx);
        await store.save({ ...d, recoveryHashes: left, wrong: 0, lockedUntil: undefined });
        return { stepUpToken: issue(accountId, d.nonce), recoveryLeft: left.length };
      }
      const secret = openSecret(sk(), d.sealedSecret);
      const step = secret ? verifyTotp(secret, code, now(), d.lastStep) : null;
      if (step === null) { await this._wrong(d); throw fail("mfa_bad_code", "That code is not right.", 400); }
      await store.save({ ...d, lastStep: step, wrong: 0, lockedUntil: undefined });
      return { stepUpToken: issue(accountId, d.nonce), recoveryLeft: d.recoveryHashes.length };
    },

    async _wrong(d) {
      const wrong = (d.wrong || 0) + 1;
      await store.save({ ...d, wrong: wrong >= MAX_WRONG ? 0 : wrong, lockedUntil: wrong >= MAX_WRONG ? new Date(now() + LOCK_MS) : d.lockedUntil });
    },

    /** Used by requireStaff. Returns {ok:true} or {ok:false, code}. */
    async check(accountId, token) {
      const d = await store.find(accountId);
      if (!d?.enabled) return { ok: false, code: "mfa_enrol_required" };
      try {
        const c = jwt.verify(String(token || ""), stepUpKey(), { issuer: ISS });
        if (c.purpose === "pv_stepup" && c.sub === String(accountId) && c.nonce === d.nonce) return { ok: true };
      } catch { /* fall through */ }
      return { ok: false, code: "mfa_required" };
    },

    /** Removes someone's second step so they can enrol again. Old step-up tokens stop working. */
    async reset(accountId) { await store.remove(accountId); },
    stepFor,
  };
}

let shared = null;
export const reviewerMfa = () => (shared ||= createReviewerMfa());
export const setReviewerMfaForTests = (m) => { shared = m; };

/** Routes. `base` = requireStaff-like guard without the step-up check; `strong` = guard with it (for the reset route). */
export function buildMfaRouter({ base, strong, audit = async () => {}, mfa = reviewerMfa }) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many tries. Please wait a few minutes." } });
  const send = (res, e) => res.status(e.status || 500).json({ success: false, code: e.code, message: e.status ? e.message : "Something went wrong." });
  const h = (fn) => async (req, res) => {
    try { res.json({ success: true, data: await fn(req) }); } catch (e) { if (!e.status) console.error("[VERIFY] mfa error:", e); send(res, e); }
  };
  const roles = ["reviewer", "senior_reviewer", "compliance_admin"];
  router.get("/staff/verification/mfa/status", limiter, base(...roles), h((req) => mfa().status(req.staff.id)));
  router.post("/staff/verification/mfa/setup", limiter, base(...roles), h(async (req) => { const r = await mfa().setup(req.staff.id, req.staff.email || req.staff.name); await audit(req.staff.id, "mfa_setup_started", req.staff.id); return r; }));
  router.post("/staff/verification/mfa/enable", limiter, base(...roles), h(async (req) => { const r = await mfa().enable(req.staff.id, req.body?.code); await audit(req.staff.id, "mfa_enabled", req.staff.id); return r; }));
  router.post("/staff/verification/mfa/verify", limiter, base(...roles), h(async (req) => { const r = await mfa().verify(req.staff.id, { code: req.body?.code, recoveryCode: req.body?.recoveryCode }); await audit(req.staff.id, "mfa_verified", req.staff.id); return r; }));
  router.post("/staff/verification/mfa/reset/:accountId", limiter, strong("compliance_admin"), h(async (req) => {
    const id = String(req.params.accountId || "");
    if (!/^[a-f0-9]{24}$/i.test(id)) throw Object.assign(new Error("Not a valid account id."), { status: 400, code: "bad_id" });
    if (id === req.staff.id) throw Object.assign(new Error("Ask another compliance admin to reset your own second step."), { status: 403, code: "self_reset" });
    await mfa().reset(id);
    await audit(req.staff.id, "mfa_reset", id);
    return { reset: true };
  }));
  return router;
}
