/**
 * One-off script: assigns a random verificationToken to every invoice
 * that doesn't have one yet (invoices created before this field
 * existed). Needed because the public /billing/invoices/verify/:token
 * route now looks up by this token instead of the sequential
 * invoiceNumber — any invoice already printed with a QR code encoding
 * the old invoiceNumber-based URL will need a reprint to pick up the
 * new link, but this at least makes every existing invoice
 * verifiable again via its detail view / a resent copy.
 *
 * Run via Render's "One-Off Jobs":
 *   node scripts/backfillInvoiceVerificationTokens.js
 *
 * Safe to re-run — it only processes invoices where verificationToken
 * is missing.
 */
import crypto from "node:crypto";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import { invoiceModel } from "../modules/billing/invoice_model.js";

const run = async () => {
  await connectDB();

  const invoices = await invoiceModel.find({
    $or: [{ verificationToken: null }, { verificationToken: { $exists: false } }],
  });

  console.log(`Found ${invoices.length} invoice(s) needing a verification token.`);

  let updated = 0;

  for (const invoice of invoices) {
    invoice.verificationToken = crypto.randomBytes(20).toString("hex");
    await invoice.save();
    updated += 1;
  }

  console.log(`Done. Updated ${updated} invoice(s).`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
