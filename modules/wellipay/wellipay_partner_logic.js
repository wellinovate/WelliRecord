// Pure rules for the WelliPay partner handshake. No database, no network, so
// they can be tested on their own.
import { createHmac, randomInt, timingSafeEqual } from "crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const SIGNATURE_TOLERANCE_SECONDS = 300;
// Codes sent to one WR-ID inside one TTL window. Stops WelliPay from being used to spam a patient.
export const MAX_CODES_PER_WINDOW = 3;

export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(key, requestId, code) {
  return createHmac("sha256", key).update(`${requestId}:${code}`).digest("hex");
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// WelliPay signs "<timestamp>.<raw body>" with the shared key (sha256=<hex>).
export function signatureFor(key, timestamp, rawBody) {
  return `sha256=${createHmac("sha256", key).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function checkRequestAuth({ key, authorization, timestamp, signature, rawBody, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!key) return { ok: false, status: 503, reason: "not_configured" };
  if (!authorization || !safeEqual(authorization, `Bearer ${key}`)) return { ok: false, status: 401, reason: "bad_key" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, status: 401, reason: "stale" };
  if (typeof rawBody !== "string" || !signature || !safeEqual(signature, signatureFor(key, ts, rawBody))) return { ok: false, status: 401, reason: "bad_signature" };
  return { ok: true };
}

export function normalizeReference(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  return /^WR-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(value) && value.length <= 40 ? value : null;
}

export function validRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

export function validCode(value) {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

export function canAttempt(row, now = new Date()) {
  return Boolean(row) && !row.consumedAt && row.expiresAt.getTime() > now.getTime() && row.attempts < MAX_ATTEMPTS;
}

export function smsText(code) {
  return `Your WelliRecord code to connect WelliPay is ${code}. It expires in 10 minutes. If you did not ask for this, ignore this message.`;
}
