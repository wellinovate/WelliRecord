/**
 * One-off script: marks accounts created before email verification
 * enforcement (2026-07-31) as verified, since they signed up before
 * a working verification email existed and have no way to self-verify
 * retroactively.
 *
 * Run via Render's "One-Off Jobs":
 *   node scripts/grandfatherVerifiedAccounts.js
 *
 * Safe to re-run — it only affects accounts still isVerified: false
 * created before the cutoff.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import connectDB from "../config/db.js";
import { Account } from "../modules/accounts/account_model.js";

const CUTOFF_DATE = new Date("2026-07-31T12:00:00Z");

const run = async () => {
  await connectDB();

  const affected = await Account.find({
    isVerified: false,
    createdAt: { $lt: CUTOFF_DATE },
  }).select("email createdAt");

  console.log(`Found ${affected.length} account(s) to grandfather:`);
  affected.forEach((a) =>
    console.log(` - ${a.email} (created ${a.createdAt.toISOString()})`)
  );

  const result = await Account.updateMany(
    {
      isVerified: false,
      createdAt: { $lt: CUTOFF_DATE },
    },
    { $set: { isVerified: true } }
  );

  console.log(`Grandfathered ${result.modifiedCount} account(s).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Grandfather script failed:", error);
  process.exit(1);
});
