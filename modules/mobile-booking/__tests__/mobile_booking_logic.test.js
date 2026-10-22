import test from "node:test";
import assert from "node:assert/strict";
import { canManage, canWork, facilityIdOf, orgGate, relayStatus, serviceBody } from "../mobile_booking_logic.js";

const approved = { _id: "p1", wrOrgId: "WR-ORG-9", organizationType: "healthcare_provider", verificationStatus: "approved", organizationName: "Grace Clinic", officeAddress: "Wuse, Abuja" };

test("only approved clinics and practitioners can use app bookings", () => {
  assert.equal(orgGate(approved).ok, true);
  assert.equal(orgGate({ ...approved, organizationType: "individaul_provider" }).ok, true);
  assert.equal(orgGate({ ...approved, organizationType: "pharmacy" }).code, "NOT_SUPPORTED_TYPE");
  assert.equal(orgGate({ ...approved, verificationStatus: "pending" }).code, "NOT_APPROVED");
  assert.equal(orgGate(null).code, "NO_ORGANIZATION");
});

test("the facility id is the organization id the mobile side knows", () => {
  assert.equal(facilityIdOf(approved), "WR-ORG-9");
  assert.equal(facilityIdOf({ _id: "abc123" }), "abc123");
});

test("owners manage; staff work visits; patients do neither", () => {
  assert.equal(canManage({ accountType: "organization" }), true);
  assert.equal(canManage({ accountType: "user", organizationId: "o1", role: "clinician" }), false);
  assert.equal(canWork({ accountType: "user", organizationId: "o1", role: "clinician" }), true);
  assert.equal(canWork({ accountType: "user", organizationId: "o1", role: "patient" }), false);
  assert.equal(canWork({ accountType: "user", role: "clinician" }), false);
});

test("the form cannot set the name, address or the payout account", () => {
  const out = serviceBody(approved, { feeInPersonMinor: 500000, facilityName: "Hacked", paystackSubaccount: "ACCT_x", staffIds: ["a"], active: true }, "Dr A");
  assert.equal(out.facilityName, "Grace Clinic");
  assert.equal(out.facilityAddress, "Wuse, Abuja");
  assert.equal(out.feeInPersonMinor, 500000);
  assert.equal("paystackSubaccount" in out, false);
  assert.equal("staffIds" in out, false);
  assert.equal(out.actor, "Dr A");
});

test("mobile errors are shown in plain words, and signature failures are not blamed on the person", () => {
  assert.equal(relayStatus({ status: 0 }).status, 503);
  assert.equal(relayStatus({ status: 401 }).status, 502);
  assert.equal(relayStatus({ status: 503, message: "x" }).status, 502);
  assert.deepEqual(relayStatus({ status: 409, message: "Taken" }), { status: 409, message: "Taken" });
  assert.equal(relayStatus({ status: 500 }).status, 502);
});
