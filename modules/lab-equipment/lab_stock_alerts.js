import mongoose from "mongoose";
import { LabReagent, LabAnalyzer } from "./lab_equipment_models.js";
import { buildStockDigest, shouldSendDigest } from "./lab_equipment_rules.js";
import { Account } from "../accounts/account_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { createNotification } from "../notifications/notification_services.js";
import { sendLabStockAlertEmail } from "../../shared/utils/resend.js";

const { Schema } = mongoose;
const logSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, unique: true },
  signature: { type: String, default: "" },
  sentAt: { type: Date, default: Date.now },
});
export const LabStockAlertLog = mongoose.models.LabStockAlertLog || mongoose.model("LabStockAlertLog", logSchema);

const POLL_MS = 6 * 60 * 60 * 1000;
const SEND_HOUR_LAGOS = 7;

// Lab data is keyed by the organisation account or its profile. Find the account that owns the mailbox.
const ownerAccount = async (organizationId) => {
  let acct = await Account.findById(organizationId).select("email").lean();
  if (acct) return { accountId: acct._id, email: acct.email };
  const profile = await OrganizationProfile.findById(organizationId).select("accountId").lean();
  if (!profile?.accountId) return null;
  acct = await Account.findById(profile.accountId).select("email").lean();
  return acct ? { accountId: acct._id, email: acct.email } : null;
};

export const runLabStockSweep = async (now = new Date()) => {
  const [rOrgs, aOrgs] = await Promise.all([
    LabReagent.distinct("organizationId", { isActive: true }),
    LabAnalyzer.distinct("organizationId", { isActive: true }),
  ]);
  const orgIds = [...new Set([...rOrgs, ...aOrgs].map(String))];
  let sent = 0;
  for (const id of orgIds) {
    try {
      const [reagents, analyzers] = await Promise.all([
        LabReagent.find({ organizationId: id, isActive: true }).lean(),
        LabAnalyzer.find({ organizationId: id, isActive: true }).lean(),
      ]);
      const digest = buildStockDigest(reagents, analyzers, now);
      const last = await LabStockAlertLog.findOne({ organizationId: id }).lean();
      if (!shouldSendDigest(digest, last, now)) {
        if (!digest.items.length && last?.signature) await LabStockAlertLog.updateOne({ organizationId: id }, { $set: { signature: "" } });
        continue;
      }
      const owner = await ownerAccount(id);
      if (!owner) continue;
      const title = digest.urgent ? "Lab stock needs attention now" : "Lab stock to reorder or check";
      const body = `${digest.items.length} item${digest.items.length === 1 ? "" : "s"} in your reagent and analyser register need attention.`;
      try {
        await createNotification({ recipientAccountId: owner.accountId, type: "system", title, body, link: "/provider/lab-orders" });
      } catch (e) { console.error("Lab stock in-app notice failed:", e?.message); }
      if (owner.email) {
        try { await sendLabStockAlertEmail({ email: owner.email, items: digest.items.map((i) => i.text), urgent: digest.urgent }); }
        catch (e) { console.error("Lab stock email failed:", e?.message); continue; }
      }
      await LabStockAlertLog.updateOne({ organizationId: id }, { $set: { signature: digest.signature, sentAt: now } }, { upsert: true });
      sent += 1;
    } catch (e) {
      console.error("Lab stock sweep failed for one lab:", e?.message);
    }
  }
  return { labs: orgIds.length, sent };
};

// Checks every 6 hours but only sends in the 7am hour in Lagos, so a lab gets at most one message a day.
export const startLabStockScheduler = () => {
  setInterval(() => {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
    if (hour < SEND_HOUR_LAGOS || hour >= SEND_HOUR_LAGOS + 6) return;
    runLabStockSweep().catch((e) => console.error("Lab stock sweep failed:", e));
  }, POLL_MS).unref();
};
