import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { Subscription } from "./subscription_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { Account } from "../accounts/account_model.js";
import { PLANS, planForOrgType } from "./subscription_rules.js";
import { recordSubscriptionPayment, resolveOrganizationAccountId } from "./subscription_service.js";
import { buildReference, parseReference, validSignature, checkVerifiedTransaction } from "./subscription_paystack_core.js";

const API = "https://api.paystack.co";
const secret = () => process.env.PAYSTACK_SECRET_KEY || "";

const paystack = async (path, init = {}) => {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.status === false) throw Object.assign(new Error(body.message || "Paystack request failed."), { status: 502 });
  return body.data;
};

// The plan and price for an organisation, from its subscription or its type. The client never sends a price.
const planFor = async (organizationId) => {
  const sub = await Subscription.findOne({ organizationId }).select("planKey").lean();
  if (sub?.planKey && PLANS[sub.planKey]) return PLANS[sub.planKey];
  const profile = await OrganizationProfile.findOne({ accountId: organizationId }).select("organizationType").lean();
  return planForOrgType(profile?.organizationType);
};

// Verifies the transaction with Paystack, then records the payment once. Safe to call from the webhook and the return page.
export const settleReference = async (reference) => {
  const organizationId = parseReference(reference);
  if (!organizationId) return { ok: false, reason: "not_ours" };
  const plan = await planFor(organizationId);
  if (!plan) return { ok: false, reason: "no_plan" };
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const check = checkVerifiedTransaction(tx, { reference, expectedKobo: plan.amountKobo });
  if (!check.ok) return check;
  const out = await recordSubscriptionPayment({ organizationId, months: plan.months, amountKobo: tx.amount, reference, source: "paystack", recordedBy: "paystack" });
  return { ok: true, duplicate: out.duplicate, resumed: Boolean(out.resumed) };
};

// Mounted before express.json: the signature is checked on the raw body.
export const subscriptionWebhook = express.Router();
subscriptionWebhook.post("/api/v1/subscriptions/paystack/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  if (!secret()) return res.status(503).end();
  if (!validSignature(req.body, req.get("x-paystack-signature"), secret())) return res.status(401).end();
  let event;
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).end(); }
  // Acknowledge at once for events that are not ours.
  if (event?.event !== "charge.success" || !parseReference(event?.data?.reference)) return res.status(200).end();
  try {
    await settleReference(event.data.reference);
    res.status(200).end();
  } catch (e) {
    console.error("[subscriptions] paystack webhook:", e.message);
    res.status(500).end(); // Paystack retries
  }
});

export const subscriptionCheckout = express.Router();

// Starts a payment for the signed-in provider's own organisation. Not behind the suspension gate: a suspended provider must be able to pay.
subscriptionCheckout.post("/me/checkout", protect, async (req, res, next) => {
  try {
    if (!secret()) return res.status(503).json({ success: false, message: "Online payment is not available yet. Contact support@wellirecord.com." });
    const organizationId = await resolveOrganizationAccountId(req.user);
    if (!organizationId) return res.status(403).json({ success: false, message: "No organisation is associated with this account." });
    const plan = await planFor(organizationId);
    if (!plan) return res.status(400).json({ success: false, message: "This organisation type does not have a subscription." });
    const email = req.user?.email || (await Account.findById(req.user?.sub).select("email").lean())?.email;
    if (!email) return res.status(400).json({ success: false, message: "Your account has no email address for the receipt." });
    const reference = buildReference(organizationId);
    const base = process.env.FRONTEND_URL || "https://www.wellirecord.com";
    const data = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({ email, amount: plan.amountKobo, currency: "NGN", reference, callback_url: `${base}/provider?reference=${reference}`, metadata: { organizationId, plan: plan.key } }),
    });
    res.json({ success: true, data: { authorizationUrl: data.authorization_url, reference, amountKobo: plan.amountKobo } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
});

// The return page calls this so the provider is resumed without waiting for the webhook.
subscriptionCheckout.post("/me/verify", protect, async (req, res, next) => {
  try {
    const organizationId = await resolveOrganizationAccountId(req.user);
    const reference = String(req.body?.reference || "");
    if (!organizationId || parseReference(reference) !== organizationId) return res.status(403).json({ success: false, message: "That payment does not belong to your organisation." });
    const out = await settleReference(reference);
    res.json({ success: out.ok, ...out });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
});
