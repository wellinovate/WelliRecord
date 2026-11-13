/**
 * Find or recover a website admin sign-in.
 *
 *   node scripts/admin-account.js list
 *       Prints the email, role and status of every admin account. No passwords.
 *   node scripts/admin-account.js reset <email>
 *       Sets a new random temporary password on that admin account and prints it once.
 *       Sign in, then change it. Other sessions end because passwordChangedAt moves.
 *
 * Run it as a Render one-off job (Shell tab) on the website backend. It only touches
 * accounts whose role is admin, provider_admin or super_admin, and refuses all others.
 */
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { Account } from "../modules/accounts/account_model.js";

const ADMIN_ROLES = ["admin", "super_admin", "provider_admin"];

const run = async () => {
  const [cmd, email] = process.argv.slice(2);
  if (!["list", "reset"].includes(cmd) || (cmd === "reset" && !email)) {
    console.error("Usage: node scripts/admin-account.js list | reset <email>");
    process.exit(1);
  }
  await connectDB();
  if (cmd === "list") {
    const rows = await Account.find({ role: { $in: ADMIN_ROLES } }).select("email role status isActive lastLoginAt").lean();
    if (!rows.length) console.log("No admin accounts found.");
    for (const r of rows) console.log(`${r.email}  role=${r.role}  status=${r.status}  active=${r.isActive}  lastLogin=${r.lastLoginAt || "never"}`);
  } else {
    const a = await Account.findOne({ email: email.toLowerCase().trim() }).select("+password email role");
    if (!a) { console.error("No account with that email."); process.exit(1); }
    if (!ADMIN_ROLES.includes(a.role)) { console.error("That account is not an admin account."); process.exit(1); }
    const temp = crypto.randomBytes(12).toString("base64url");
    a.password = temp; // hashed by the model's pre-save hook
    a.status = "active";
    a.isActive = true;
    await a.save();
    console.log(`Temporary password for ${a.email}: ${temp}`);
    console.log("Sign in and change it now. This is shown once.");
  }
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
