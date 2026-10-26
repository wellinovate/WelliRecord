/**
 * Gives an existing user account a provider-verification reviewer role (or takes it back to patient).
 * Reviewers sign in with their normal website login.
 *
 *   node scripts/set-reviewer-role.js person@example.com senior_reviewer
 *   roles: reviewer | senior_reviewer | compliance_admin | patient
 *
 * Run it as a Render one-off job. It refuses organisation accounts. There is no second sign-in step on the website yet, so
 * give these roles only to people whose account has a strong, unique password.
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { Account } from "../modules/accounts/account_model.js";

const ROLES = ["reviewer", "senior_reviewer", "compliance_admin", "patient"];

const run = async () => {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role)) {
    console.error(`Usage: node scripts/set-reviewer-role.js <email> <${ROLES.join("|")}>`);
    process.exit(1);
  }
  await connectDB();
  const a = await Account.findOne({ email: email.toLowerCase().trim() });
  if (!a) { console.error("No account with that email."); process.exit(1); }
  if (a.accountType !== "user") { console.error("Only a person's account can be a reviewer."); process.exit(1); }
  a.role = role;
  await a.save();
  console.log(`Set ${a.email} to ${role}. They must sign in again.`);
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
