// scripts/grandfatherVerifiedAccounts.js
// One-time script: mark all accounts created before email verification
// enforcement as verified, since they have no working way to verify
// retroactively (no resend endpoint exists yet for this flow).
//
// Run once, then delete this file.

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Account } from "../modules/accounts/account_model.js";

dotenv.config();

const CUTOFF_DATE = new Date("2026-07-31T12:00:00Z"); // adjust to your actual deploy time

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const result = await Account.updateMany(
    {
      isVerified: false,
      createdAt: { $lt: CUTOFF_DATE },
    },
    { $set: { isVerified: true } }
  );

  console.log(`Grandfathered ${result.modifiedCount} accounts.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Grandfather script failed:", err);
  process.exit(1);
});
