// WelliID: WR-<REGION><zone>-<suffix>, for example WR-ABJ1-2RWR. Same scheme as server/welliId.ts in
// WellIRecordMobileApp: the region is where the person registered and never changes; the zone digit
// moves up only when a zone's suffixes are running out; the suffix has no 0, O, 1, I or L.
import crypto from "crypto";
import { UNSPECIFIED_REGION, regionByCode, resolveRegion } from "./nigeriaRegions.js";

export const SUFFIX_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SUFFIX_LENGTH = 4;
const MAX_ZONE = 9;
const TRIES_PER_ZONE = 8;

export function randomSuffix(random = (n) => crypto.randomInt(n)) {
  let s = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) s += SUFFIX_ALPHABET[random(SUFFIX_ALPHABET.length)];
  return s;
}

export const formatWelliId = (regionCode, zone, suffix) => `WR-${regionCode}${zone}-${suffix}`;

/** Make an ID that `exists` says is unused. A unique index must still back it up. */
export async function issueWelliId({ state, exists, random } = {}) {
  const picked = resolveRegion(state);
  const region = picked || UNSPECIFIED_REGION;
  for (let zone = 1; zone <= MAX_ZONE; zone++) {
    for (let i = 0; i < TRIES_PER_ZONE; i++) {
      const id = formatWelliId(region.code, zone, randomSuffix(random));
      if (!(await exists(id))) return { id, region, hasRegion: Boolean(picked) };
    }
  }
  throw new Error("Could not issue a WelliID");
}

const NEW_FORMAT = /^WR-([A-Z]{3})([1-9])-([2-9A-HJKMNP-Z]{4})$/;

/** Display only. Reports use the region saved on the profile, since an older random ID can look like this by chance. */
export function parseWelliId(id) {
  const m = NEW_FORMAT.exec(String(id ?? "").trim().toUpperCase());
  if (!m) return null;
  return { regionCode: m[1], zone: Number(m[2]), suffix: m[3], region: regionByCode(m[1]) };
}

export const isWelliId = (v) => /^WR-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(String(v ?? "").trim());
