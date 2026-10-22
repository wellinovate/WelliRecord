// Canonical LGA / area council catalogue. Copy of server/data/nigeriaLgas.ts in WellIRecordMobileApp.
// Codes are `<REGION>-<SLUG>`. Only entries checked against an official list belong here.
// The six FCT area councils are a seed and still need that check. Other states take free text.
export const LGA_CATALOGUE_REVIEW = "seed_pending_review";

export const LGAS = Object.freeze([
  { code: "ABJ-AMAC", region: "ABJ", name: "Abuja Municipal (AMAC)", aliases: ["AMAC", "Abuja Municipal", "Abuja Municipal Area Council", "Municipal"] },
  { code: "ABJ-ABAJI", region: "ABJ", name: "Abaji" },
  { code: "ABJ-BWARI", region: "ABJ", name: "Bwari" },
  { code: "ABJ-GWAGWALADA", region: "ABJ", name: "Gwagwalada" },
  { code: "ABJ-KUJE", region: "ABJ", name: "Kuje" },
  { code: "ABJ-KWALI", region: "ABJ", name: "Kwali" },
]);
