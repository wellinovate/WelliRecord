/**
 * One-off script: geocodes officeAddress for every organization that
 * doesn't yet have a location, so nearby-search can find them.
 *
 * Run via Render's "One-Off Jobs":
 *   node scripts/backfillOrganizationLocations.js
 *
 * Safe to re-run — it only processes orgs where location is missing.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import { OrganizationProfile } from "../modules/organizations/organizations_model.js";
import { geocodeAddress } from "../shared/utils/googleMaps.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  await connectDB();

  const orgs = await OrganizationProfile.find({
    officeAddress: { $ne: null, $ne: "" },
    location: { $exists: false },
  });

  console.log("Found " + orgs.length + " organization(s) needing geocoding.");

  let succeeded = 0;
  let failed = 0;

  for (const org of orgs) {
    const location = await geocodeAddress(org.officeAddress);

    if (location) {
      org.location = location;
      org.geocodedAt = new Date();
      await org.save();
      succeeded += 1;
      console.log("Geocoded: " + org.organizationName);
    } else {
      failed += 1;
      console.log("Could not geocode: " + org.organizationName + " (" + org.officeAddress + ")");
    }

    await sleep(200);
  }

  console.log("Done. Succeeded: " + succeeded + ", Failed: " + failed);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
