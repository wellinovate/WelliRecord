import test from "node:test";
import assert from "node:assert/strict";

// Loads the model and routes without a database to catch bad imports and schema errors.
test("model, service and routes load", async () => {
  process.env.JWT_SECRET_KEY ||= "x";
  const { RecordLink } = await import("../record_link_model.js");
  const routes = await import("../record_link_routes.js");
  assert.equal(typeof routes.default, "function");
  const doc = new RecordLink({ organizationId: "64b000000000000000000001", localCustomerId: "64b000000000000000000002", initiatedBy: "64b000000000000000000003", status: "awaiting_patient_verification", tokenHash: "h", expiresAt: new Date() });
  assert.equal(doc.validateSync(), undefined);
  assert.ok(new RecordLink({ ...doc.toObject(), status: "nope" }).validateSync());
});
