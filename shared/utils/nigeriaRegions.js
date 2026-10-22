// The 36 states and the Federal Capital Territory, each with a WelliRecord region code.
// These are WelliRecord's own codes, not government codes. This list is a copy of
// server/data/nigeriaRegions.ts in WellIRecordMobileApp (also copied into the website and the app).
// Each repo's test checks the same fingerprint, so a change must be made in all four places.
export const REGIONS = Object.freeze([
  { code: "ABI", name: "Abia" },
  { code: "ADA", name: "Adamawa" },
  { code: "AKW", name: "Akwa Ibom" },
  { code: "ANA", name: "Anambra" },
  { code: "BAU", name: "Bauchi" },
  { code: "BAY", name: "Bayelsa" },
  { code: "BEN", name: "Benue" },
  { code: "BOR", name: "Borno" },
  { code: "CRI", name: "Cross River" },
  { code: "DEL", name: "Delta" },
  { code: "EBO", name: "Ebonyi" },
  { code: "EDO", name: "Edo" },
  { code: "EKI", name: "Ekiti" },
  { code: "ENU", name: "Enugu" },
  { code: "ABJ", name: "FCT, Abuja" },
  { code: "GOM", name: "Gombe" },
  { code: "IMO", name: "Imo" },
  { code: "JIG", name: "Jigawa" },
  { code: "KAD", name: "Kaduna" },
  { code: "KAN", name: "Kano" },
  { code: "KAT", name: "Katsina" },
  { code: "KEB", name: "Kebbi" },
  { code: "KOG", name: "Kogi" },
  { code: "KWA", name: "Kwara" },
  { code: "LAG", name: "Lagos" },
  { code: "NAS", name: "Nasarawa" },
  { code: "NIG", name: "Niger" },
  { code: "OGU", name: "Ogun" },
  { code: "OND", name: "Ondo" },
  { code: "OSU", name: "Osun" },
  { code: "OYO", name: "Oyo" },
  { code: "PLA", name: "Plateau" },
  { code: "RIV", name: "Rivers" },
  { code: "SOK", name: "Sokoto" },
  { code: "TAR", name: "Taraba" },
  { code: "YOB", name: "Yobe" },
  { code: "ZAM", name: "Zamfara" },
]);

export const UNSPECIFIED_REGION = Object.freeze({ code: "UNK", name: "Not stated" });

// Other spellings people use. Keys are lower case with everything but letters removed.
const ALIASES = {
  fct: "ABJ",
  abuja: "ABJ",
  fctabuja: "ABJ",
  federalcapitalterritory: "ABJ",
  federalcapitalterritoryabuja: "ABJ",
  akwaibom: "AKW",
  crossriver: "CRI",
  nassarawa: "NAS",
};

const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function resolveRegion(input) {
  const key = squash(input);
  if (!key) return null;
  const code = ALIASES[key];
  if (code) return REGIONS.find((r) => r.code === code) || null;
  return REGIONS.find((r) => squash(r.name) === key || r.code.toLowerCase() === key) || null;
}

export const regionByCode = (code) =>
  code === UNSPECIFIED_REGION.code ? UNSPECIFIED_REGION : REGIONS.find((r) => r.code === code) || null;

export const REGIONS_FINGERPRINT_SOURCE = REGIONS.map((r) => `${r.code}=${r.name}`).join("|");
