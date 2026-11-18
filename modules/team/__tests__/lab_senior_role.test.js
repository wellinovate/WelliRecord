import test from "node:test";
import assert from "node:assert/strict";
import { getEffectivePermissions } from "../permission_registry.js";
import { getRoleCatalog } from "../role_catalog.js";

test("senior lab scientist can approve, a technician cannot", () => {
  assert.ok(getEffectivePermissions("lab_senior").includes("approve_lab_results"));
  assert.ok(getEffectivePermissions("lab_senior").includes("write_lab_results"));
  assert.ok(!getEffectivePermissions("lab_tech").includes("approve_lab_results"));
});

test("a revoke removes approval from a senior", () => {
  assert.ok(!getEffectivePermissions("lab_senior", { revoked: ["approve_lab_results"] }).includes("approve_lab_results"));
});

test("labs and hospitals can invite the role, with a clear label", () => {
  const lab = getRoleCatalog({ organizationType: "diagnostic" });
  assert.ok(JSON.stringify(lab).includes("lab_senior"));
  assert.ok(JSON.stringify(lab).includes("Senior Lab Scientist"));
});
