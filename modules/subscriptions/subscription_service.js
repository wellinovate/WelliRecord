import mongoose from "mongoose";
import { Subscription } from "./subscription_model.js";
import { subscriptionState, describeSubscription, nextPeriodEnd, noticesDue, graceEndsAt, PLANS, planForOrgType, trialSubscriptionFields } from "./subscription_rules.js";
import { Account } from "../accounts/account_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { createNotification } from "../notifications/notification_services.js";
// The email sender is loaded when needed so the gate (imported by many routes) does not require the mail key at load time.
const sendSubscriptionNoticeEmail = async (args) => (await import("../../shared/utils/resend.js")).sendSubscriptionNoticeEmail(args);

const adminEmail = () => process.env.ADMIN_NOTIFICATION_EMAIL || "inquiry@wellirecord.com";

// The organisation a signed-in provider-side user belongs to: the owner by account, staff by membership.
export const resolveOrganizationAccountId = async (user) => {
  if (!user?.sub) return null;
  const own = await OrganizationProfile.findOne({ accountId: user.sub }).select("_id").lean();
  if (own) return String(user.sub);
  if (!user.profileId) return null;
  const m = await OrganizationMembership.findOne({ userId: user.profileId, isActive: true }).select("organizationId").lean();
  return m ? String(m.organizationId) : null;
};

export const SUSPENDED_RESPONSE = {
  success: false,
  code: "SUBSCRIPTION_SUSPENDED",
  message: "Your provider profile is suspended because the subscription has not been paid. It resumes automatically once payment is received. Contact support@wellirecord.com if you have already paid.",
};

// Returns the suspended response body when this user's organisation is suspended, otherwise null.
// Fails open: an organisation with no subscription record, or a lookup error, is never blocked.
export const suspensionFor = async (user) => {
  try {
    if (!user || user.role === "patient") return null;
    const orgId = await resolveOrganizationAccountId(user);
    if (!orgId) return null;
    const sub = await Subscription.findOne({ organizationId: orgId }).select("periodEnd graceDays exempt").lean();
    return subscriptionState(sub) === "suspended" ? SUSPENDED_RESPONSE : null;
  } catch (e) {
    console.error("Subscription check failed:", e?.message);
    return null;
  }
};

const orgInfo = async (organizationId) => {
  const [profile, acct] = await Promise.all([
    OrganizationProfile.findOne({ accountId: organizationId }).select("organizationName").lean(),
    Account.findById(organizationId).select("email").lean(),
  ]);
  return { name: profile?.organizationName || "", email: acct?.email || "" };
};

const notify = async (organizationId, kind, sub, extra = {}) => {
  const info = await orgInfo(organizationId);
  const base = {
    organizationName: info.name,
    periodEndOn: sub.periodEnd,
    graceEndsOn: graceEndsAt(sub),
    newPeriodEndOn: sub.periodEnd,
    trial: Boolean(sub.trial),
    amountKobo: sub.amountKobo,
    ...extra,
  };
  const titles = {
    ended: ["Your subscription has ended", "Renew within the grace period to avoid suspension."],
    suspended: ["Your provider profile is suspended", "Pay your subscription to restore access."],
    resumed: ["Your provider profile is active again", "Thank you. Your payment was received."],
  };
  try {
    await createNotification({ recipientAccountId: organizationId, type: "system", title: titles[kind][0], body: titles[kind][1], link: "/provider/settings" });
  } catch (e) { console.error("Subscription in-app notice failed:", e?.message); }
  let providerOk = true;
  if (info.email) {
    try { await sendSubscriptionNoticeEmail({ email: info.email, kind, ...base }); }
    catch (e) { providerOk = false; console.error("Subscription provider email failed:", e?.message); }
  }
  try { await sendSubscriptionNoticeEmail({ email: adminEmail(), kind: `admin-${kind}`, ...base }); }
  catch (e) { console.error("Subscription admin email failed:", e?.message); }
  return providerOk;
};

// Daily job: sends the "ended" and "suspended" notices and keeps the stored status and the
// profile flag in step. Safe to run any number of times.
export const runSubscriptionSweep = async (now = new Date()) => {
  const subs = await Subscription.find({ exempt: { $ne: true } });
  let ended = 0, suspended = 0;
  for (const sub of subs) {
    try {
      const state = subscriptionState(sub, now);
      const stamp = new Date(sub.periodEnd).toISOString();
      for (const kind of noticesDue(sub, now)) {
        const ok = await notify(sub.organizationId, kind, sub);
        if (!ok) continue; // retried at the next sweep
        if (kind === "ended") { sub.endedNoticeFor = stamp; ended++; }
        if (kind === "suspended") { sub.suspendedNoticeFor = stamp; suspended++; }
      }
      if (sub.status !== state) {
        sub.status = state;
        if (state === "suspended") sub.suspendedAt = now;
      }
      await sub.save();
      await OrganizationProfile.updateOne({ accountId: sub.organizationId }, { $set: { subscriptionSuspended: state === "suspended" } });
    } catch (e) {
      console.error("Subscription sweep failed for one organisation:", e?.message);
    }
  }
  return { checked: subs.length, ended, suspended };
};

// Called when money is received: from an admin now, from a payment gateway webhook later.
// Extends the period, clears the suspension and tells both sides. A repeated reference is ignored.
export const recordSubscriptionPayment = async ({ organizationId, months, amountKobo, reference, source = "manual", recordedBy = "", now = new Date() }) => {
  if (!mongoose.Types.ObjectId.isValid(organizationId)) throw Object.assign(new Error("Unknown organisation."), { status: 400 });
  const ref = String(reference || "").trim();
  if (!ref) throw Object.assign(new Error("A payment reference is required."), { status: 400 });
  let sub = await Subscription.findOne({ organizationId });
  if (!sub) {
    // First payment for an organisation with no subscription yet (for example a laboratory that has just joined).
    const profile = await OrganizationProfile.findOne({ accountId: organizationId }).select("organizationType").lean();
    const plan = planForOrgType(profile?.organizationType);
    if (!plan) throw Object.assign(new Error("This organisation type does not have a subscription."), { status: 400 });
    sub = new Subscription({ organizationId, planKey: plan.key, plan: plan.name, amountKobo: plan.amountKobo, periodEnd: now });
  }
  if (sub.payments.some((p) => p.reference === ref)) return { duplicate: true, subscription: sub };
  if (months == null) months = PLANS[sub.planKey]?.months ?? 12;

  const wasState = subscriptionState(sub, now);
  const end = nextPeriodEnd(sub, months, now);
  sub.payments.push({ reference: ref, amountKobo: Number.isFinite(Number(amountKobo)) ? Number(amountKobo) : sub.amountKobo, months, source, recordedBy, paidAt: now, periodEndAfter: end });
  sub.periodEnd = end;
  sub.status = "active";
  sub.trial = false;
  if (wasState === "suspended") sub.resumedAt = now;
  await sub.save();
  await OrganizationProfile.updateOne({ accountId: organizationId }, { $set: { subscriptionSuspended: false } });
  if (wasState === "suspended") await notify(organizationId, "resumed", sub);
  return { duplicate: false, resumed: wasState === "suspended", subscription: sub };
};

export const describeForOrganization = async (organizationId, now = new Date()) => {
  const sub = await Subscription.findOne({ organizationId }).lean();
  if (!sub) return { state: "none", plan: "", periodEnd: null, graceEndsAt: null, daysLeft: null };
  return { plan: sub.plan, amountKobo: sub.amountKobo, graceDays: sub.graceDays, exempt: sub.exempt, ...describeSubscription(sub, now) };
};

const POLL_MS = 6 * 60 * 60 * 1000;
const SEND_HOUR_LAGOS = 7;

// Checks every 6 hours and runs in the 7am to 1pm window in Lagos, so a failed email is retried later that day.
export const startSubscriptionScheduler = () => {
  setInterval(() => {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
    if (hour < SEND_HOUR_LAGOS || hour >= SEND_HOUR_LAGOS + 6) return;
    runSubscriptionSweep().catch((e) => console.error("Subscription sweep failed:", e));
  }, POLL_MS).unref();
};

// Starts the free trial when a provider is approved. Labs have no trial: their subscription starts
// with the first payment. Never throws, so an approval cannot fail because of this.
export const startTrialForProfile = async (profile, now = new Date()) => {
  try {
    const fields = trialSubscriptionFields(planForOrgType(profile?.organizationType), now);
    if (!fields) return null;
    const exists = await Subscription.findOne({ organizationId: profile.accountId }).select("_id").lean();
    if (exists) return null;
    return await Subscription.create({ organizationId: profile.accountId, ...fields });
  } catch (e) {
    console.error("Starting the subscription trial failed:", e?.message);
    return null;
  }
};

// For providers approved before subscriptions existed: starts their trial from today.
export const startTrialsForApproved = async ({ dryRun = true, now = new Date() } = {}) => {
  const profiles = await OrganizationProfile.find({ verificationStatus: "approved" }).select("accountId organizationType organizationName").lean();
  const have = new Set((await Subscription.find({ organizationId: { $in: profiles.map((p) => p.accountId) } }).select("organizationId").lean()).map((s) => String(s.organizationId)));
  const todo = profiles.filter((p) => !have.has(String(p.accountId)) && trialSubscriptionFields(planForOrgType(p.organizationType), now));
  if (!dryRun) for (const p of todo) await startTrialForProfile(p, now);
  return { dryRun, count: todo.length, organisations: todo.map((p) => p.organizationName) };
};
