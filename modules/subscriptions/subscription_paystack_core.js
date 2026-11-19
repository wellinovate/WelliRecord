import crypto from "node:crypto";

// Rules for subscription payments through Paystack. No network, no database.

const REF_PREFIX = "ws-";

// ws-<organisation account id>-<8 hex>. A new one for each attempt.
export const buildReference = (organizationId) => `${REF_PREFIX}${organizationId}-${crypto.randomBytes(4).toString("hex")}`;

export const parseReference = (reference) => {
  const m = /^ws-([0-9a-f]{24})-[0-9a-f]{8}$/i.exec(String(reference || ""));
  return m ? m[1] : null;
};

// Paystack signs the raw body with HMAC-SHA512 using the secret key.
export const validSignature = (rawBody, signature, secret) => {
  if (!secret || !signature || !rawBody) return false;
  const want = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const got = String(signature).toLowerCase();
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
};

// What a verified Paystack transaction must show before a period is extended.
// Returns { ok, reason }. The amount must be at least the plan price for the months being bought.
export const checkVerifiedTransaction = (tx, { reference, expectedKobo }) => {
  if (!tx || tx.status !== "success") return { ok: false, reason: "not_successful" };
  if (tx.reference !== reference) return { ok: false, reason: "reference_mismatch" };
  if (String(tx.currency || "NGN").toUpperCase() !== "NGN") return { ok: false, reason: "wrong_currency" };
  if (!Number.isFinite(Number(tx.amount)) || Number(tx.amount) < expectedKobo) return { ok: false, reason: "underpaid" };
  return { ok: true };
};
