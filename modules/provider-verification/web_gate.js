import { AppError } from "../../shared/errors/AppError.js";

/**
 * Gate for the website's own clinician paths (telehealth join, app-booking video token).
 * Separate flag from PROVIDER_VERIFICATION_ENFORCE so live doctors are not locked out on deploy:
 * it is OFF unless PROVIDER_VERIFICATION_ENFORCE_WEB=true. PROVIDER_VERIFICATION_ENFORCE=false still wins (gate fully off).
 */
export const webGateOn = (env = process.env) => String(env.PROVIDER_VERIFICATION_ENFORCE_WEB ?? "").toLowerCase() === "true";

let gate = null;
/** server.js hands in the built verification object once. */
export const setWebGate = (verification) => { gate = verification; };

/**
 * Throws 403 PROVIDER_NOT_VERIFIED unless the signed-in person is an eligible provider.
 * Fails closed when the flag is on and the gate was never wired.
 */
export const assertProviderEligible = async (authUser, action, ctx = {}, env = process.env) => {
  if (!webGateOn(env)) return { skipped: true };
  if (!gate || typeof gate.canPerform !== "function") throw new AppError("Provider verification is not available.", 503, "VERIFICATION_UNAVAILABLE");
  const r = await gate.canPerform({ staffUserId: String(authUser?.sub ?? "") }, action, ctx);
  if (!r.eligible) throw new AppError("Your provider verification is not current, so this action is not available. Check your status under Provider verification.", 403, "PROVIDER_NOT_VERIFIED");
  return r;
};
