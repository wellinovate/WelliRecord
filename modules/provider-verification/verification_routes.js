// Wires provider verification into the website backend: who counts as a provider or reviewer, how documents are stored and
// scanned, and how email goes out. The rules and routes live in verification_service.js.
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import { protect } from "../auth/auth_middleware.js";
import { createProviderVerification, startVerificationSweep, enforcementOn } from "./verification_service.js";
import { createS3Storage, s3ConfigFromEnv, createClamScanner } from "./doc_storage.js";
import { auditIsRestricted, auditModelFor } from "./verification_models.js";
import { reviewerMfa, mfaRequired, buildMfaRouter } from "./reviewer_mfa.js";

/** Website account roles that may apply as a provider. The pilot category is doctor. */
export const APPLICANT_ROLES = ["doctor", "provider_admin", "provider"];
export const REVIEWER_ROLES = ["reviewer", "senior_reviewer", "compliance_admin"];

/**
 * The service asks for logical roles ('clinician', 'reviewer', ...). This maps them onto Account.role and puts the
 * signed-in person on req.staff. Organisation accounts are never providers.
 */
export function staffFromToken(user, wanted) {
  if (!user?.sub) return null;
  const role = String(user.role || "");
  let logical = null;
  if (REVIEWER_ROLES.includes(role)) logical = role;
  else if (user.accountType === "user" && APPLICANT_ROLES.includes(role)) logical = "clinician";
  if (!logical || !wanted.includes(logical)) return null;
  return { id: String(user.sub), role: logical, name: user.fullName || user.email || "Provider", email: user.email };
}

/** Signed in and the right role. Does not ask for the second step. Used by the MFA routes themselves. */
export const requireStaffBase = (...wanted) => (req, res, next) =>
  protect(req, res, () => {
    const s = staffFromToken(req.user, wanted);
    if (!s) return res.status(403).json({ success: false, message: "Access denied: insufficient permissions" });
    req.staff = s;
    next();
  });

/**
 * Signed in, the right role and, for reviewer roles, the second step (x-step-up-token). A reviewer who has not set the
 * step up gets 403 mfa_enrol_required; one who has but has not proved it this session gets 403 mfa_required.
 * REVIEWER_MFA_REQUIRED=false exists only for a first deploy before any reviewer has enrolled; boot warns when it is set.
 */
export const requireStaff = (...wanted) => (req, res, next) =>
  requireStaffBase(...wanted)(req, res, async () => {
    if (!REVIEWER_ROLES.includes(req.staff.role) || !mfaRequired()) return next();
    try {
      const r = await reviewerMfa().check(req.staff.id, req.headers["x-step-up-token"]);
      if (!r.ok) return res.status(403).json({ success: false, code: r.code, message: r.code === "mfa_enrol_required" ? "Set up the second sign-in step to use reviewer tools." : "Enter your second-step code to continue." });
      next();
    } catch (err) {
      console.error("[VERIFY] second-step check failed (refused):", err);
      res.status(403).json({ success: false, code: "mfa_required", message: "Enter your second-step code to continue." });
    }
  });

/** The signed-in person's account id when a valid token is present, without rejecting the request. */
const optionalUserId = (req) => {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) return null;
    const d = jwt.verify(h.split(" ")[1], process.env.JWT_SECRET_KEY, { issuer: "wellirecord-api", audience: "wellirecord-client" });
    return d?.sub ? String(d.sub) : null;
  } catch {
    return null;
  }
};

async function sendEmail(to, subject, text) {
  if (!process.env.RESEND_API_KEY) return false;
  const r = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: "WelliRecord <noreply@send.wellirecord.com>",
    to,
    subject,
    text,
  });
  return !r.error;
}

export function buildProviderVerification() {
  const v = createProviderVerification({
    requireStaff,
    limiter: rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many tries. Please wait a few minutes." } }),
    getAuthUserId: optionalUserId,
    storage: createS3Storage(s3ConfigFromEnv()),
    scanner: createClamScanner(process.env.CLAMD_HOST, Number(process.env.CLAMD_PORT) || 3310),
    sendEmail,
  });
  if (!mfaRequired()) console.warn("[VERIFY] REVIEWER_MFA_REQUIRED=false: reviewer routes do NOT ask for a second step");
  if (!process.env.MFA_SECRET_KEY) console.warn("[VERIFY] MFA_SECRET_KEY is not set: reviewer second-step secrets are sealed with JWT_SECRET_KEY. Set it before anyone enrols and do not change it later.");
  v.mfaRouter = buildMfaRouter({
    base: requireStaffBase,
    strong: requireStaff,
    audit: async (actorId, action, subjectId) => {
      try { await auditModelFor().create({ actorId, actorType: "staff", action, subjectType: "account", subjectId }); } catch (e) { console.error("[VERIFY] audit write failed:", e); }
    },
  });
  if (!enforcementOn()) console.warn("[VERIFY] PROVIDER_VERIFICATION_ENFORCE=false: the eligibility gate is OFF");
  if (!auditIsRestricted()) console.warn("[VERIFY] AUDIT_MONGO_URI is not set: the audit log is append-only in the app but not at database level");
  return v;
}

export { startVerificationSweep };
