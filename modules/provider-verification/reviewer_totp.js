// Time-based one-time passwords (RFC 6238), no extra dependency. HMAC-SHA1, 30 second steps, 6 digits:
// what Google Authenticator, Microsoft Authenticator, Authy and 1Password expect. Port of the mobile backend's server/totp.ts.
import crypto from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 string");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));
export const stepFor = (ms) => Math.floor(ms / 1000 / STEP_SECONDS);

export function hotp(secret, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totp = (secretB32, ms, digits = DIGITS) => hotp(base32Decode(secretB32), stepFor(ms), digits);

/** Accepts the current step and one either side. `lastUsedStep` blocks replay. Returns the matched step or null. */
export function verifyTotp(secretB32, code, ms, lastUsedStep = -1) {
  const given = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const secret = base32Decode(secretB32);
  const now = stepFor(ms);
  let matched = null;
  for (const step of [now - 1, now, now + 1]) {
    const same = crypto.timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(given));
    if (same && step > lastUsedStep && (matched === null || step > matched)) matched = step;
  }
  return matched;
}

export function otpauthUrl(secretB32, account, issuer = "WelliRecord Reviewer") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ----- secrets at rest -----
const key = (k) => crypto.createHash("sha256").update(`welli-reviewer-mfa-v1:${k}`).digest();

/** AES-256-GCM. Output: iv.tag.ciphertext, base64url parts. */
export function sealSecret(k, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(k), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(k, sealed) {
  try {
    const [iv, tag, ct] = String(sealed).split(".").map((p) => Buffer.from(p, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", key(k), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ----- recovery codes -----
const RC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    let s = "";
    for (let i = 0; i < 10; i++) s += RC[crypto.randomInt(RC.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const normaliseRecovery = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecovery = (k, code) => crypto.createHmac("sha256", k).update(`reviewer-mfa-recovery:${normaliseRecovery(code)}`).digest("hex");
