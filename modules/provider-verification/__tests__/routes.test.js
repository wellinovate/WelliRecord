import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { staffFromToken } from "../verification_routes.js";

describe("who counts as a provider or reviewer", () => {
  const person = (role, extra = {}) => ({ sub: "a1", role, accountType: "user", fullName: "Ada Obi", email: "ada@x.ng", ...extra });

  it("maps doctor-like website roles to clinician", () => {
    for (const role of ["doctor", "provider_admin", "provider"]) {
      assert.equal(staffFromToken(person(role), ["clinician"])?.role, "clinician");
    }
  });
  it("never treats a patient, nurse or admin as a clinician or reviewer", () => {
    for (const role of ["patient", "nurse", "admin", "staff", "caregiver"]) {
      assert.equal(staffFromToken(person(role), ["clinician", "reviewer", "senior_reviewer", "compliance_admin"]), null);
    }
  });
  it("never treats an organisation account as a clinician", () => {
    assert.equal(staffFromToken(person("provider_admin", { accountType: "organization" }), ["clinician"]), null);
  });
  it("reviewer roles keep their own name and only pass where listed", () => {
    assert.equal(staffFromToken(person("reviewer"), ["reviewer", "senior_reviewer"])?.role, "reviewer");
    assert.equal(staffFromToken(person("reviewer"), ["senior_reviewer", "compliance_admin"]), null);
    assert.equal(staffFromToken(person("compliance_admin"), ["senior_reviewer", "compliance_admin"])?.role, "compliance_admin");
  });
  it("a clinician cannot use a reviewer route", () => {
    assert.equal(staffFromToken(person("doctor"), ["reviewer", "senior_reviewer", "compliance_admin"]), null);
  });
  it("needs a token subject", () => {
    assert.equal(staffFromToken({ role: "doctor", accountType: "user" }, ["clinician"]), null);
    assert.equal(staffFromToken(null, ["clinician"]), null);
  });
});
