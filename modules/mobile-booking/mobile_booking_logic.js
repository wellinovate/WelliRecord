// Rules for a website organisation setting up and working its bookings in the mobile app.
// The mobile backend does the booking itself; this side decides who may ask it to.

export const SUPPORTED_TYPES = ["healthcare_provider", "individaul_provider"]; // type spelling as stored

/** The id the mobile backend knows the organisation by (see welliProviders.ts there). */
export const facilityIdOf = (profile) => String(profile?.wrOrgId || profile?._id || "");

export function orgGate(profile) {
  if (!profile) return { ok: false, status: 404, code: "NO_ORGANIZATION", message: "Organization not found." };
  if (!SUPPORTED_TYPES.includes(profile.organizationType)) {
    return { ok: false, status: 403, code: "NOT_SUPPORTED_TYPE", message: "App bookings are for clinics, hospitals and individual practitioners." };
  }
  if (profile.verificationStatus !== "approved") {
    return { ok: false, status: 403, code: "NOT_APPROVED", message: "Your organization is waiting for approval. App bookings open after it is approved." };
  }
  return { ok: true };
}

/** Owner accounts manage everything. Invited staff may work visits but not change fees or decide HMO cover. */
export const canManage = (authUser) => authUser?.accountType === "organization";
export const canWork = (authUser) => canManage(authUser) || (Boolean(authUser?.organizationId) && !["patient", "caregiver", "family_member"].includes(authUser?.role));

const SERVICE_FIELDS = ["offersInPerson", "offersVirtual", "feeInPersonMinor", "feeVirtualMinor", "acceptsHmo", "payAtVisit", "onlinePayment", "slotMinutes", "weekly", "active"];

/** Only these fields leave the website. Name, address and specialty come from the approved organisation profile, never from the form. */
export function serviceBody(profile, body, actor) {
  const out = {};
  for (const k of SERVICE_FIELDS) if (body && body[k] !== undefined) out[k] = body[k];
  out.facilityName = profile.organizationName;
  out.facilityAddress = profile.officeAddress || "";
  out.specialty = profile.profession || profile.contactPersonRole || "";
  out.actor = actor || "";
  return out;
}

/** A mobile-backend error becomes one the person can read. A signature problem is our fault, so it is never shown as "not allowed". */
export function relayStatus(r) {
  if (r.status === 0) return { status: 503, message: "The app service could not be reached. Try again in a moment." };
  if (r.status === 401 || r.status === 503) return { status: 502, message: "App bookings are not switched on yet." };
  if (r.status >= 500) return { status: 502, message: r.message || "The app service had a problem. Try again." };
  return { status: r.status, message: r.message || "That could not be done." };
}
