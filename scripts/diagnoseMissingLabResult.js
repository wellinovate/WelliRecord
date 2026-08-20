/**
 * Read-only diagnostic. Does not modify anything.
 *
 * Prints the most recently created LabResult documents, so you can see
 * whether a specific release (e.g. from Ageless) actually created a
 * document at all, and if so:
 *   - which patientId it's attached to (to catch a wrong-patient match
 *     during the "verify patient" step of the release flow)
 *   - whether it has an attachment with a real url
 *   - its recordStatus / patientVisible / visibility flags (in case any
 *     of those are hiding it from the patient's own view)
 *
 * Usage:
 *   node scripts/diagnoseMissingLabResult.js                # last 10 overall
 *   node scripts/diagnoseMissingLabResult.js --wrid WR-1234  # filter to one patient's WR ID
 */
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import { labResultModel } from "../modules/lab/lab_model.js";
import { UserProfile } from "../modules/users/user_profile_model.js";

const run = async () => {
  await connectDB();

  const wrIdArgIndex = process.argv.indexOf("--wrid");
  const wrId = wrIdArgIndex !== -1 ? process.argv[wrIdArgIndex + 1] : null;

  let patientFilter = {};
  if (wrId) {
    const profile = await UserProfile.findOne({ wrId }).select("_id fullName wrId");
    if (!profile) {
      console.log(`No patient found with wrId "${wrId}". Check the ID and try again.`);
      process.exit(0);
    }
    console.log(`Filtering to patient: ${profile.fullName} (${profile.wrId}, _id=${profile._id})\n`);
    patientFilter = { patientId: profile._id };
  }

  const results = await labResultModel
    .find(patientFilter)
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("patientId", "fullName wrId")
    .lean();

  if (results.length === 0) {
    console.log("No LabResult documents found" + (wrId ? " for that patient." : " at all."));
    process.exit(0);
  }

  console.log(`Most recent ${results.length} lab result(s):\n`);
  for (const r of results) {
    const patientLabel = r.patientId?.fullName
      ? `${r.patientId.fullName} (${r.patientId.wrId})`
      : `patientId=${r.patientId} (no profile found — orphaned reference?)`;

    console.log(`  "${r.testName}"`);
    console.log(`    patient:        ${patientLabel}`);
    console.log(`    createdAt:      ${r.createdAt?.toISOString()}`);
    console.log(`    resultedAt:     ${r.resultedAt?.toISOString()}`);
    console.log(`    source:         ${r.source}`);
    console.log(`    recordStatus:   ${r.recordStatus}`);
    console.log(`    patientVisible: ${r.patientVisible}`);
    console.log(`    visibility:     ${r.visibility}`);
    console.log(`    attachments:    ${r.attachments?.length ? r.attachments.map((a) => a.url).join(", ") : "(none)"}`);
    console.log("");
  }

  process.exit(0);
};

run().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
