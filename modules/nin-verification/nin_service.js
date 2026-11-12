import { randomUUID } from "node:crypto";
import { COUNTED_OUTCOMES, MAX_COUNTED_ATTEMPTS, cleanNin, matchIdentity, profileComplete } from "./nin_core.js";
import { NinProviderError, ninConfig } from "./nin_client.js";

const DAY_MS = 24 * 3600_000;

const fail = (status, code, message) => ({ ok: false, status, code, message });

/**
 * Checks a patient's NIN against 2AM and, when the name and date of birth match their profile, marks the profile
 * identity verified. `deps` holds the database and network calls so the rules can be tested without either.
 * The NIN is never returned, stored or logged.
 */
export async function verifyNin({ accountId, nin, consent, deps, env = process.env, now = () => new Date() }) {
  if (!ninConfig(env).enabled) return fail(503, "not_available", "The identity check is not available right now.");
  if (consent !== true) return fail(400, "consent_required", "Please agree to the identity check to continue.");
  const clean = cleanNin(nin);
  if (!clean) return fail(400, "invalid_nin", "Enter your 11-digit NIN.");

  const profile = await deps.getProfile(accountId);
  if (!profile) return fail(404, "no_profile", "Profile not found.");
  if (profile.identityVerifiedAt) return { ok: true, status: 200, already: true, verifiedAt: profile.identityVerifiedAt };
  if (!profileComplete(profile)) {
    return fail(422, "profile_incomplete", "Add your full name and date of birth to your profile first, then try again.");
  }

  const since = new Date(now().getTime() - DAY_MS);
  const used = await deps.countAttempts(accountId, since, COUNTED_OUTCOMES);
  if (used >= MAX_COUNTED_ATTEMPTS) {
    return fail(429, "too_many_attempts", "You have reached the limit for today. Try again tomorrow or contact support.");
  }
  const dailyCap = Number(env.TWOAM_DAILY_LIMIT || 200);
  if ((await deps.countAllAttempts(since)) >= dailyCap) {
    return fail(503, "not_available", "The identity check is not available right now.");
  }

  const consentAt = now();
  let record;
  try {
    record = await deps.lookup({ nin: clean, idempotencyKey: `wr-nin-${randomUUID()}` });
  } catch (e) {
    const code = e instanceof NinProviderError ? e.code : "provider_down";
    if (code === "not_found") {
      await deps.recordAttempt({ accountId, outcome: "not_found", consentAt });
      return fail(422, "not_found", "We could not find that NIN. Check the number and try again.");
    }
    console.warn(`[nin] provider error: ${code}`); // code only, never the NIN or the response
    await deps.recordAttempt({ accountId, outcome: "provider_error", consentAt });
    return fail(502, "provider_error", "The identity check is unavailable right now. Try again later.");
  }

  const m = matchIdentity(profile, record);
  if (!m.ok) {
    await deps.recordAttempt({ accountId, outcome: "mismatch", requestId: record.requestId, consentAt });
    return fail(
      422,
      "mismatch",
      "The name or date of birth on that NIN does not match your WelliRecord profile. Check your profile details and try again.",
    );
  }

  const verifiedAt = now();
  await deps.markVerified(accountId, verifiedAt);
  await deps.recordAttempt({ accountId, outcome: "verified", requestId: record.requestId, consentAt });
  return { ok: true, status: 200, already: false, verifiedAt };
}
