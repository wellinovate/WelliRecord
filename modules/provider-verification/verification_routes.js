// Wires provider verification into the website backend: who counts as a provider or reviewer, how documents are stored and
// scanned, and how email goes out. The rules and routes live in verification_service.js.
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import { protect } from "../auth/auth_middleware.js";
import { createProviderVerification, startVerificationSweep, enforcementOn } from "./verification_service.js";
import { createS3Storage, s3ConfigFromEnv, createClamScanner } from "./doc_storage.js";
import { auditIsRestricted } from "./verification_models.js";

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

export const requireStaff = (...wanted) => (req, res, next) =>
  protect(req, res, () => {
    const s = staffFromToken(req.user, wanted);
    if (!s) return res.status(403).json({ success: false, message: "Access denied: insufficient permissions" });
    req.staff = s;
    next();
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
  if (!enforcementOn()) console.warn("[VERIFY] PROVIDER_VERIFICATION_ENFORCE=false: the eligibility gate is OFF");
  if (!auditIsRestricted()) console.warn("[VERIFY] AUDIT_MONGO_URI is not set: the audit log is append-only in the app but not at database level");
  return v;
}

export { startVerificationSweep };
