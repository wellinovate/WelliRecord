// Rules for the NIN check. No database and no network, so it can be tested on its own.
//
// The NIN is used for one lookup and is never stored or logged. Only the outcome is kept.

export const NIN_LENGTH = 11;
export const MAX_COUNTED_ATTEMPTS = 3; // per account, per 24 hours (provider outages do not count)
export const COUNTED_OUTCOMES = ["verified", "mismatch", "not_found"];

/** Returns the 11 digits, or null if the input is not an NIN. Spaces and dashes are ignored. */
export function cleanNin(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const s = String(value).replace(/[\s-]/g, "");
  return /^\d{11}$/.test(s) ? s : null;
}

/** Lower case, accents removed, anything that is not a letter becomes a space. */
export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function tokens(...parts) {
  const out = new Set();
  for (const p of parts) for (const t of normalizeName(p).split(" ")) if (t) out.add(t);
  return out;
}

/**
 * The first and last name on the NIN record must both appear in the profile's names, in any order.
 * The profile may carry extra names (a middle name, a second surname).
 */
export function namesMatch(profile, record) {
  const have = tokens(profile?.fullName, profile?.firstName, profile?.middleName, profile?.lastName);
  const first = normalizeName(record?.firstName);
  const last = normalizeName(record?.lastName);
  if (!first || !last) return false;
  const all = (s) => s.split(" ").every((t) => have.has(t));
  return all(first) && all(last);
}

/** Calendar date as YYYY-MM-DD in Lagos time (UTC+1). Accepts a Date or a date string. */
export function lagosDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getTime() + 3600_000).toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!m) return null;
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso;
  }
  return null;
}

export function dobMatches(profileDob, recordDob) {
  const a = lagosDate(profileDob);
  const b = lagosDate(recordDob);
  return Boolean(a && b && a === b);
}

/** True when the profile has what is needed to compare. Checked before any paid lookup. */
export function profileComplete(profile) {
  const hasName = normalizeName(profile?.fullName || `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`).split(" ").filter(Boolean).length >= 2;
  return hasName && Boolean(lagosDate(profile?.dateOfBirth));
}

export function matchIdentity(profile, record) {
  const name = namesMatch(profile, record);
  const dob = dobMatches(profile?.dateOfBirth, record?.dateOfBirth);
  return { name, dob, ok: name && dob };
}
