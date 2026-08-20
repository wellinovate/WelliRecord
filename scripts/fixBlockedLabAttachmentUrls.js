/**
 * Fixes lab result attachments that were uploaded before the
 * resource_type fix (see lab_delivery_service.js) — files that got
 * saved under Cloudinary's "image" resource type, which blocks
 * unauthenticated PDF/ZIP delivery and returns HTTP 401 on the
 * "View Document" link.
 *
 * For each affected attachment, this:
 *   1. Downloads the original bytes directly from Cloudinary using
 *      authenticated admin credentials (this works even though the
 *      public delivery URL 401s — the block is on public delivery,
 *      not on the file existing or being readable by the account
 *      that owns it).
 *   2. Re-uploads those same bytes under resource_type: "raw", which
 *      isn't subject to the same restriction.
 *   3. Updates the LabResult document's attachments[].url to the new,
 *      working URL.
 *   4. Deletes the old broken "image"-type asset from Cloudinary, so
 *      nothing is left dangling.
 *
 * SAFE BY DEFAULT: running with no arguments only lists which
 * attachments are affected and what would change — nothing is
 * uploaded, updated, or deleted until you pass --confirm.
 *
 * Usage (Render Shell):
 *   node scripts/fixBlockedLabAttachmentUrls.js              # dry run
 *   node scripts/fixBlockedLabAttachmentUrls.js --confirm     # actually fix
 */
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import cloudinary from "../shared/config/cloudinary.js";
import { labResultModel } from "../modules/lab/lab_model.js";

// Any attachment URL containing this is one that was uploaded under
// resource_type "image" but lives in the lab_reports folder used only
// for delivery-flow attachments — the exact pattern this bug produced.
const BROKEN_PATTERN = "/image/upload/";
const LAB_REPORTS_FOLDER_MARKER = "/lab_reports/";

const run = async () => {
  await connectDB();

  const affected = await labResultModel.find({
    "attachments.url": { $regex: `${BROKEN_PATTERN}.*${LAB_REPORTS_FOLDER_MARKER}` },
  });

  if (affected.length === 0) {
    console.log("No affected attachments found. Nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${affected.length} lab result(s) with a blocked attachment URL:\n`);

  const confirmed = process.argv.includes("--confirm");
  let fixedCount = 0;

  for (const doc of affected) {
    for (const attachment of doc.attachments) {
      if (!attachment.url?.includes(BROKEN_PATTERN) || !attachment.url?.includes(LAB_REPORTS_FOLDER_MARKER)) {
        continue;
      }

      console.log(`  "${doc.testName}" (${doc._id})`);
      console.log(`    current (broken): ${attachment.url}`);

      if (!confirmed) {
        console.log(`    [dry run — would download, re-upload as raw, and update this URL]\n`);
        continue;
      }

      try {
        // Extract the public_id Cloudinary needs to identify the
        // existing asset (everything after /upload/v<version>/,
        // minus the file extension).
        const afterUpload = attachment.url.split("/upload/")[1];
        const withoutVersion = afterUpload.replace(/^v\d+\//, "");
        const publicId = withoutVersion.replace(/\.[^/.]+$/, "");

        // Cloudinary's admin API can read this asset directly even
        // though public delivery of it is blocked — the download_url
        // it hands back for a private/authenticated fetch works
        // regardless of the same-account delivery restriction.
        const resourceInfo = await cloudinary.api.resource(publicId, { resource_type: "image" });

        const fetchRes = await fetch(resourceInfo.secure_url.replace("/image/upload/", "/image/authenticated/") || resourceInfo.secure_url);
        // Fallback: some Cloudinary plans don't support the authenticated
        // delivery type swap above — if that fetch fails, fall back to
        // asking Cloudinary to re-deliver via its own signed URL instead.
        let buffer;
        if (fetchRes.ok) {
          buffer = Buffer.from(await fetchRes.arrayBuffer());
        } else {
          const signedUrl = cloudinary.url(publicId, {
            resource_type: "image",
            sign_url: true,
            type: "upload",
          });
          const signedRes = await fetch(signedUrl);
          if (!signedRes.ok) {
            throw new Error(`Could not retrieve original file (status ${signedRes.status}) — may need to re-release this result instead.`);
          }
          buffer = Buffer.from(await signedRes.arrayBuffer());
        }

        const reuploaded = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "lab_reports", resource_type: "raw" },
            (err, res) => (err ? reject(err) : resolve(res)),
          );
          stream.end(buffer);
        });

        attachment.url = reuploaded.secure_url;
        console.log(`    fixed:            ${reuploaded.secure_url}`);

        await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch((e) => {
          console.warn(`    (old asset cleanup failed, not fatal: ${e.message})`);
        });

        fixedCount += 1;
      } catch (err) {
        console.error(`    FAILED: ${err.message}`);
        console.error(`    This one may need to be re-released through the delivery flow instead.\n`);
        continue;
      }

      console.log("");
    }

    if (confirmed) {
      await doc.save();
    }
  }

  if (!confirmed) {
    console.log("Dry run only — nothing changed. Re-run with --confirm to apply the fixes above.");
  } else {
    console.log(`Done. Fixed ${fixedCount} attachment(s).`);
  }

  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
