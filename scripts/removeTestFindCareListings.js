/**
 * Removes the fake/test organizations that show up in patient Find Care
 * search: "Zonax Specialist Clinic & Maternity", "Wellicare Eye &
 * Specialty Clinic", and "Zonax Community Health & Nursing Care". These
 * are real OrganizationProfile documents (not frontend mock data) that
 * appear because they're marked isLicensed: true — searchProvidersService
 * (organizations_services.js) only filters on isLicensed, not on any
 * "test" flag, so any dev/test org created with isLicensed: true shows
 * up in real patient search right alongside genuine pilot facilities.
 *
 * Matches by exact organizationName only — deliberately not a loose
 * pattern like /zonax/i, so this can't accidentally catch a real future
 * organization that happens to share part of a name.
 *
 * SAFE BY DEFAULT: running this with no arguments only lists what it
 * would remove — it does not delete anything until you pass --confirm.
 *
 * Usage (Render "One-Off Jobs" or local with the right DATABASE env var):
 *   node scripts/removeTestFindCareListings.js              # dry run — lists matches
 *   node scripts/removeTestFindCareListings.js --confirm     # actually deletes
 *
 * If any other test/dev organizations turn up in Find Care later, add
 * their exact organizationName to KNOWN_TEST_ORG_NAMES below and re-run
 * — don't widen the match to a regex without checking each result by eye
 * first, for the same accidental-real-org reason noted above.
 */
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import { OrganizationProfile } from "../modules/organizations/organizations_model.js";

const KNOWN_TEST_ORG_NAMES = [
  "Zonax Specialist Clinic & Maternity",
  "Wellicare Eye & Specialty Clinic",
  "Zonax Community Health & Nursing Care",
];

const run = async () => {
  await connectDB();

  const matches = await OrganizationProfile.find({
    organizationName: { $in: KNOWN_TEST_ORG_NAMES },
  }).select("_id organizationName organizationType email isLicensed verificationStatus createdAt");

  if (matches.length === 0) {
    console.log("No matching organizations found. Nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${matches.length} matching organization(s):\n`);
  for (const org of matches) {
    console.log(
      `  ${org._id}  "${org.organizationName}"  type=${org.organizationType}  ` +
        `email=${org.email}  isLicensed=${org.isLicensed}  ` +
        `verificationStatus=${org.verificationStatus}  createdAt=${org.createdAt?.toISOString()}`,
    );
  }

  const confirmed = process.argv.includes("--confirm");

  if (!confirmed) {
    console.log(
      "\nDry run only — nothing deleted. Re-run with --confirm once you've " +
        "reviewed the list above and confirmed every one of these is test data.",
    );
    process.exit(0);
  }

  const result = await OrganizationProfile.deleteMany({
    organizationName: { $in: KNOWN_TEST_ORG_NAMES },
  });

  console.log(`\nDeleted ${result.deletedCount} organization(s).`);
  console.log(
    "Note: this only removes the OrganizationProfile documents. If any " +
      "of these test orgs also have an Account/UserProfile, team " +
      "memberships, or other linked records, those aren't touched by " +
      "this script — check for orphaned references if that matters here.",
  );
  process.exit(0);
};

run().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
