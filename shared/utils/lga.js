// Maps a typed or picked LGA to a canonical code. Copy of server/lgaCore.ts in WellIRecordMobileApp.
// Exact match (after normalising) in the person's state is `verified`. Anything else keeps the text and gets no code:
// `needs_review` when the state has a catalogue, `unverified` when it has none. The LGA is never part of the WelliID.
import { LGAS } from "./nigeriaLgas.js";

export const cleanLgaText = (v) =>
  String(v ?? "").replace(/[^\p{L}\p{N} .,'()/-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);

export function normalizeLga(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\blocal government area\b|\blocal government\b|\bl\.?g\.?a\.?\b|\barea council\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const lgasForRegion = (region) => LGAS.filter((l) => l.region === region);

export function mapLga(regionCode, text, code) {
  const lgaText = cleanLgaText(text);
  const entries = lgasForRegion(regionCode);
  const picked = typeof code === "string" ? entries.find((e) => e.code === code) : undefined;
  if (picked) return { lgaText: lgaText || picked.name, lgaCode: picked.code, lgaMappingStatus: "verified" };
  if (!lgaText) return { lgaText: "", lgaCode: "", lgaMappingStatus: "unverified" };
  const key = normalizeLga(lgaText);
  const hit = key ? entries.find((e) => [e.name, ...(e.aliases ?? [])].some((n) => normalizeLga(n) === key)) : undefined;
  if (hit) return { lgaText, lgaCode: hit.code, lgaMappingStatus: "verified" };
  return { lgaText, lgaCode: "", lgaMappingStatus: entries.length > 0 ? "needs_review" : "unverified" };
}
