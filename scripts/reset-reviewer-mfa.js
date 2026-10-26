/**
 * Removes a reviewer's second step so they can set it up again (lost phone, no recovery codes).
 * Their open step-up tokens stop working. Run as a Render one-off job.
 *
 *   node scripts/reset-reviewer-mfa.js person@example.com
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { Account } from "../modules/accounts/account_model.js";
import { PvMfa } from "../modules/provider-verification/reviewer_mfa.js";

const run = async () => {
  const email = (process.argv[2] || "").toLowerCase().trim();
  if (!email) { console.error("Usage: node scripts/reset-reviewer-mfa.js <email>"); process.exit(1); }
  await connectDB();
  const a = await Account.findOne({ email });
  if (!a) { console.error("No account with that email."); process.exit(1); }
  const r = await PvMfa.deleteOne({ accountId: String(a._id) });
  console.log(r.deletedCount ? `Second step removed for ${email}. They can set it up again.` : `${email} had no second step set up.`);
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
