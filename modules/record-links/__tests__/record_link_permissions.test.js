import test from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, getEffectivePermissions } from "../../team/permission_registry.js";

test("the record link permissions exist", () => {
  assert.ok(PERMISSIONS.manage_record_links);
  assert.ok(PERMISSIONS.approve_record_links);
});

test("approval is held by admins, doctors and clinicians, not by nurses, front desk or pharmacists", () => {
  const can = (role, key, overrides) => getEffectivePermissions(role, overrides).includes(key);
  for (const r of ["provider_admin", "doctor", "clinician"]) assert.ok(can(r, "approve_record_links"), r);
  for (const r of ["nurse", "frontdesk", "pharmacist", "lab_tech", "support_staff", "insurer_agent"]) assert.ok(!can(r, "approve_record_links"), r);
});

test("front desk can start and manage links but not release them", () => {
  const p = getEffectivePermissions("frontdesk", {});
  assert.ok(p.includes("manage_record_links"));
  assert.ok(!p.includes("approve_record_links"));
});

test("an admin can grant or revoke approval for one person", () => {
  assert.ok(getEffectivePermissions("nurse", { granted: ["approve_record_links"] }).includes("approve_record_links"));
  assert.ok(!getEffectivePermissions("doctor", { revoked: ["approve_record_links"] }).includes("approve_record_links"));
});
