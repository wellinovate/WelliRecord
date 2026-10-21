import crypto from "crypto";

// No 0/O/1/I/L so a code read aloud or typed from a screen is hard to get wrong.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 10 * 60 * 1000;

export function newLinkCode(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const normalizeCode = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const validCode = (v) => {
  const c = normalizeCode(v);
  return c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch));
};

export const hashCode = (code, secret) => crypto.createHmac("sha256", secret).update(normalizeCode(code)).digest("hex");

/** Mobile account ids are opaque strings from the other backend. Keep only a safe shape. */
export const cleanMobileId = (v) => {
  const s = String(v ?? "").trim();
  return /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : null;
};

/** What the phone sees of a website appointment. */
export function phoneAppointment(a, orgName) {
  const start = new Date(a.scheduledFor);
  const dur = a.durationMin || 30;
  return {
    id: String(a._id),
    scheduledFor: start.toISOString(),
    durationMin: dur,
    status: a.status,
    visitType: a.visitType || "in_person",
    organizationName: orgName || "",
    reasonForVisit: a.reasonForVisit || "",
    joinOpensAt: new Date(start.getTime() - 10 * 60_000).toISOString(),
    joinClosesAt: new Date(start.getTime() + (dur + 60) * 60_000).toISOString(),
  };
}
