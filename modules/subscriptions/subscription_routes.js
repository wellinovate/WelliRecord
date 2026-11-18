import express from "express";
import { protect, requireAdmin } from "../auth/auth_middleware.js";
import { Subscription } from "./subscription_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { cleanSubscriptionInput, describeSubscription, DEFAULT_GRACE_DAYS } from "./subscription_rules.js";
import { describeForOrganization, recordSubscriptionPayment, resolveOrganizationAccountId, runSubscriptionSweep, startTrialsForApproved } from "./subscription_service.js";

const router = express.Router();

// A provider's own status. Deliberately not behind the suspension gate: a suspended provider
// has to be able to see why and when it resumes.
router.get("/me", protect, async (req, res, next) => {
  try {
    const orgId = await resolveOrganizationAccountId(req.user);
    if (!orgId) return res.status(403).json({ success: false, message: "No organisation is associated with this account." });
    res.json({ success: true, data: await describeForOrganization(orgId) });
  } catch (e) { next(e); }
});

router.get("/", protect, requireAdmin, async (_req, res, next) => {
  try {
    const subs = await Subscription.find().sort({ periodEnd: 1 }).lean();
    const profiles = await OrganizationProfile.find({ accountId: { $in: subs.map((s) => s.organizationId) } }).select("accountId organizationName").lean();
    const names = new Map(profiles.map((p) => [String(p.accountId), p.organizationName]));
    res.json({
      success: true,
      data: subs.map((s) => ({ ...s, organizationName: names.get(String(s.organizationId)) || "", ...describeSubscription(s) })),
    });
  } catch (e) { next(e); }
});

router.put("/:organizationId", protect, requireAdmin, async (req, res, next) => {
  try {
    const profile = await OrganizationProfile.findOne({ accountId: req.params.organizationId }).select("_id").lean();
    if (!profile) return res.status(404).json({ success: false, message: "No provider organisation has that id." });
    const { value, errors } = cleanSubscriptionInput(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(" ") });
    const existing = await Subscription.findOne({ organizationId: req.params.organizationId });
    if (!existing && !value.periodEnd) return res.status(400).json({ success: false, message: "Period end is required for a new subscription." });
    const sub = await Subscription.findOneAndUpdate(
      { organizationId: req.params.organizationId },
      { $set: value, $setOnInsert: { graceDays: value.graceDays ?? DEFAULT_GRACE_DAYS } },
      { upsert: true, new: true, runValidators: true },
    );
    // A changed period end starts a fresh cycle of notices.
    res.json({ success: true, data: { ...sub.toObject(), ...describeSubscription(sub) } });
  } catch (e) { next(e); }
});

router.post("/:organizationId/payments", protect, requireAdmin, async (req, res, next) => {
  try {
    const out = await recordSubscriptionPayment({
      organizationId: req.params.organizationId,
      months: req.body?.months,
      amountKobo: req.body?.amountKobo,
      reference: req.body?.reference,
      source: "manual",
      recordedBy: req.user?.email || req.user?.sub || "",
    });
    res.json({ success: true, duplicate: out.duplicate, resumed: Boolean(out.resumed), data: { ...out.subscription.toObject(), ...describeSubscription(out.subscription) } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    if (/Months must/.test(e.message)) return res.status(400).json({ success: false, message: e.message });
    next(e);
  }
});

// Starts the free trial, from today, for approved providers that have no subscription. Preview first: { "dryRun": true }.
router.post("/start-trials", protect, requireAdmin, async (req, res, next) => {
  try { res.json({ success: true, data: await startTrialsForApproved({ dryRun: req.body?.dryRun !== false }) }); } catch (e) { next(e); }
});

// Lets an admin run the daily check now.
router.post("/sweep", protect, requireAdmin, async (_req, res, next) => {
  try { res.json({ success: true, data: await runSubscriptionSweep() }); } catch (e) { next(e); }
});

export default router;
