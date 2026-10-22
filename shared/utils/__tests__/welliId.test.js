import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { REGIONS, REGIONS_FINGERPRINT_SOURCE, resolveRegion } from "../nigeriaRegions.js";
import { formatWelliId, isWelliId, issueWelliId, parseWelliId, randomSuffix } from "../welliId.js";

test("the region list is the same as in the mobile server, the website and the app", () => {
  const h = crypto.createHash("sha256").update(REGIONS_FINGERPRINT_SOURCE).digest("hex");
  assert.equal(h, "78640607c1d0c7790b0f984666dd7705e0552cff2c54d461d413ee988ae76bec");
  assert.equal(REGIONS.length, 37);
  assert.equal(new Set(REGIONS.map((r) => r.code)).size, 37);
});

test("states resolve from common spellings", () => {
  assert.equal(resolveRegion("Lagos")?.code, "LAG");
  assert.equal(resolveRegion("FCT")?.code, "ABJ");
  assert.equal(resolveRegion("Federal Capital Territory")?.code, "ABJ");
  assert.equal(resolveRegion("Akwa-Ibom")?.code, "AKW");
  assert.equal(resolveRegion("Atlantis"), null);
  assert.equal(resolveRegion(undefined), null);
});

test("IDs have the region, a zone digit and a suffix with no look-alike characters", async () => {
  assert.equal(formatWelliId("ABJ", 1, "2RWR"), "WR-ABJ1-2RWR");
  for (let i = 0; i < 100; i++) assert.match(randomSuffix(), /^[2-9A-HJKMNP-Z]{4}$/);
  const r = await issueWelliId({ state: "Lagos", exists: async () => false });
  assert.match(r.id, /^WR-LAG1-/);
  assert.equal(r.hasRegion, true);
});

test("a taken ID is not reused; a full zone moves to the next; no state means UNK", async () => {
  const seq = [0, 0, 0, 0, 1, 1, 1, 1];
  let n = 0;
  const taken = new Set(["WR-LAG1-2222"]);
  const r = await issueWelliId({ state: "Lagos", exists: async (id) => taken.has(id), random: () => seq[n++ % seq.length] });
  assert.equal(r.id, "WR-LAG1-3333");
  const z = await issueWelliId({ state: "Rivers", exists: async (id) => id.startsWith("WR-RIV1-") });
  assert.match(z.id, /^WR-RIV2-/);
  const u = await issueWelliId({ exists: async () => false });
  assert.match(u.id, /^WR-UNK1-/);
  assert.equal(u.hasRegion, false);
  await assert.rejects(issueWelliId({ state: "Kano", exists: async () => true }));
});

test("parse and format checks", () => {
  assert.equal(parseWelliId("wr-abj1-2rwr")?.region?.name, "FCT, Abuja");
  assert.equal(parseWelliId("WR-4821-K3QZ"), null);
  assert.equal(isWelliId("WR-ABJ1-2RWR"), true);
  assert.equal(isWelliId("WR-4821-K3QZ"), true);
  assert.equal(isWelliId("WR-ABJ-2RWR"), false);
});
