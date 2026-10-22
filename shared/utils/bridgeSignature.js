import crypto from "crypto";

// Signed requests between the website backend and the mobile backend.
// Both sides hold BRIDGE_SECRET. The signature covers the time, a one-time nonce, the method,
// the full path with query string and a hash of the body, so a captured request cannot be
// replayed later or aimed at another route. Keep this file and server/bridgeSignature.ts
// in the mobile repo identical in behaviour.

export const BRIDGE_MAX_SKEW_MS = 5 * 60 * 1000;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export const bodyString = (body) => (body === undefined || body === null || (typeof body === "object" && !Object.keys(body).length) ? "" : typeof body === "string" ? body : JSON.stringify(body));

export function bridgeSign({ secret, method, path, body, ts = Date.now(), nonce = crypto.randomBytes(12).toString("hex") }) {
  const base = [ts, nonce, String(method).toUpperCase(), path, sha256(bodyString(body))].join(".");
  const sig = crypto.createHmac("sha256", secret).update(base).digest("hex");
  return { "x-bridge-ts": String(ts), "x-bridge-nonce": nonce, "x-bridge-sig": sig };
}

/** Returns { ok: true } or { ok: false, reason }. `seen` is a Map used to refuse a repeated nonce. */
export function bridgeVerify({ secret, method, path, body, headers, now = Date.now(), seen }) {
  if (!secret || secret.length < 24) return { ok: false, reason: "not_configured" };
  const ts = Number(headers["x-bridge-ts"]);
  const nonce = String(headers["x-bridge-nonce"] || "");
  const sig = String(headers["x-bridge-sig"] || "");
  if (!Number.isFinite(ts) || !/^[a-f0-9]{16,64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(sig)) return { ok: false, reason: "bad_headers" };
  if (Math.abs(now - ts) > BRIDGE_MAX_SKEW_MS) return { ok: false, reason: "stale" };
  const expected = bridgeSign({ secret, method, path, body, ts, nonce })["x-bridge-sig"];
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  if (seen) {
    for (const [k, t] of seen) if (now - t > BRIDGE_MAX_SKEW_MS) seen.delete(k);
    if (seen.has(nonce)) return { ok: false, reason: "replayed" };
    seen.set(nonce, now);
  }
  return { ok: true };
}

const seenNonces = new Map();

/** Express middleware. Responds 401 with no detail about why. */
export function requireBridge(req, res, next) {
  const r = bridgeVerify({
    secret: process.env.BRIDGE_SECRET || "",
    method: req.method,
    path: req.originalUrl,
    body: req.body,
    headers: req.headers,
    seen: seenNonces,
  });
  if (!r.ok) {
    if (r.reason === "not_configured") return res.status(503).json({ success: false, message: "The bridge is not switched on." });
    return res.status(401).json({ success: false, message: "Not allowed." });
  }
  next();
}
