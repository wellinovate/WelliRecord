import test from "node:test";
import assert from "node:assert/strict";
import { deltaChecks } from "../lab_delta_rules.js";

const now = new Date("2026-11-18");
const row = (code, value) => ({ code, name: code, unit: "u", value });

test("flags a large haemoglobin fall and a creatinine rise", () => {
  const out = deltaChecks([row("hb", 8.9), row("creat", 2.0)], [row("hb", 12.0), row("creat", 1.0)], "2026-10-20", now);
  assert.deepEqual(out.map((d) => d.code).sort(), ["creat", "hb"]);
  assert.equal(out.find((d) => d.code === "creat").changePct, 100);
});

test("ignores small changes, old results, unknown analytes and zero baselines", () => {
  assert.equal(deltaChecks([row("hb", 11.5)], [row("hb", 12.0)], "2026-10-20", now).length, 0);
  assert.equal(deltaChecks([row("hb", 8)], [row("hb", 12)], "2026-05-01", now).length, 0);
  assert.equal(deltaChecks([row("xyz", 8)], [row("xyz", 1)], "2026-10-20", now).length, 0);
  assert.equal(deltaChecks([row("creat", 8)], [row("creat", 0)], "2026-10-20", now).length, 0);
  assert.equal(deltaChecks([row("hb", 8)], [], "2026-10-20", now).length, 0);
});
