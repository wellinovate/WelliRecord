/**
 * Standardizes legacy and typo'd lab results in the database:
 * 1. Renames misspellings (e.g. "Hemalogbin" -> "Hemoglobin").
 * 2. Normalizes categories (e.g. changing "other" to "hematology", "chemistry", etc.).
 * 3. Normalizes units (e.g. correcting "g/fl" on Lipid Profile to "mg/dL", "g/l" on Hemoglobin to "g/dL").
 * 4. Deduplicates duplicate records for the same patient, test, and date by archiving / entering-in-error.
 *
 * SAFE BY DEFAULT: runs as dry-run unless --confirm is passed.
 * Usage:
 *   node scripts/cleanupLabDuplicates.js             # dry run
 *   node scripts/cleanupLabDuplicates.js --confirm   # apply fixes
 */
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import { labResultModel } from "../modules/lab/lab_model.js";
import { normalizeLabResultData } from "../modules/lab/lab_normalizer.js";

const run = async () => {
  await connectDB();

  console.log("Searching for lab records to normalize and deduplicate...");
  const records = await labResultModel.find({ recordStatus: "active" }).sort({ createdAt: 1 });

  const toUpdate = [];
  const toDeduplicate = [];
  const seenMap = new Map();

  for (const doc of records) {
    const normalized = normalizeLabResultData({
      testName: doc.testName,
      category: doc.category,
      unit: doc.unit,
      specimen: doc.specimen,
    });

    const needsUpdate =
      normalized.testName !== doc.testName ||
      normalized.category !== doc.category ||
      (normalized.unit && normalized.unit !== doc.unit);

    if (needsUpdate) {
      toUpdate.push({
        id: doc._id,
        before: { testName: doc.testName, category: doc.category, unit: doc.unit },
        after: { testName: normalized.testName, category: normalized.category, unit: normalized.unit },
      });
    }

    // Deduplication check key
    const dateStr = doc.resultedAt ? new Date(doc.resultedAt).toISOString().split("T")[0] : "nodate";
    const patientStr = String(doc.patientId);
    const dedupKey = `${patientStr}_${normalized.testName.toLowerCase()}_${dateStr}`;

    if (seenMap.has(dedupKey)) {
      const primaryDoc = seenMap.get(dedupKey);
      toDeduplicate.push({
        duplicateId: doc._id,
        primaryId: primaryDoc._id,
        testName: normalized.testName,
        date: dateStr,
      });
    } else {
      seenMap.set(dedupKey, doc);
    }
  }

  console.log(`\nFound ${toUpdate.length} record(s) needing normalization:`);
  toUpdate.forEach((item) => {
    console.log(
      `  [${item.id}] "${item.before.testName}" (${item.before.category}, unit=${item.before.unit}) -> "${item.after.testName}" (${item.after.category}, unit=${item.after.unit})`
    );
  });

  console.log(`\nFound ${toDeduplicate.length} duplicate record(s) to archive:`);
  toDeduplicate.forEach((item) => {
    console.log(
      `  [${item.duplicateId}] duplicate of [${item.primaryId}] for test "${item.testName}" on ${item.date}`
    );
  });

  const confirmed = process.argv.includes("--confirm");
  if (!confirmed) {
    console.log(
      "\nDry run only — nothing modified. Run with --confirm to apply fixes to the database."
    );
    process.exit(0);
  }

  // Apply updates
  let updateCount = 0;
  for (const item of toUpdate) {
    await labResultModel.updateOne(
      { _id: item.id },
      {
        $set: {
          testName: item.after.testName,
          category: item.after.category,
          unit: item.after.unit,
        },
      }
    );
    updateCount++;
  }

  // Apply deduplication
  let dedupCount = 0;
  for (const item of toDeduplicate) {
    await labResultModel.updateOne(
      { _id: item.duplicateId },
      {
        $set: {
          recordStatus: "entered-in-error",
          notes: `Marked entered-in-error: duplicate entry of test ${item.testName} (ID: ${item.primaryId})`,
        },
      }
    );
    dedupCount++;
  }

  console.log(`\nSuccessfully normalized ${updateCount} record(s) and marked ${dedupCount} duplicate(s) as entered-in-error.`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
