import crypto from "crypto";
import { LabReagent, LabReagentMovement, LabReagentUsage, LabAnalyzer } from "./lab_equipment_models.js";
import { planDeduction, parseHl7Oru, mapInstrumentResults } from "./lab_equipment_rules.js";
import { labOrderModel } from "../lab-orders/lab_order_model.js";
import { STRUCTURED_TESTS } from "../lab-tests-catalog/lab_test_catalog_v2.js";

const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Takes the lab's usual amount of each reagent for this test out of stock, once per order.
// Never blocks a result: a shortfall or an error is recorded on the order and nothing is thrown.
export const deductReagentsForOrder = async (order, byName = "Automatic") => {
  try {
    if (!order.testKey || order.reagentsDeductedAt || !order.organizationId) return;
    // Claim the order first so two saves at once cannot deduct twice.
    const claimed = await labOrderModel.updateOne({ _id: order._id, reagentsDeductedAt: { $exists: false } }, { $set: { reagentsDeductedAt: new Date() } });
    if (!claimed.modifiedCount) return;

    const rules = await LabReagentUsage.find({ organizationId: order.organizationId, testKey: order.testKey }).lean();
    const shortfalls = [];
    for (const rule of rules) {
      const lots = await LabReagent.find({ organizationId: order.organizationId, isActive: true, name: new RegExp(`^${esc(rule.reagentName)}$`, "i") }).lean();
      const plan = planDeduction(lots, rule.quantityPerRun);
      let taken = 0;
      for (const a of plan.allocations) {
        const updated = await LabReagent.findOneAndUpdate({ _id: a.reagentId, quantity: { $gte: a.take } }, { $inc: { quantity: -a.take } }, { new: true }).lean();
        if (!updated) continue; // someone else used it first
        taken += a.take;
        await LabReagentMovement.create({
          organizationId: order.organizationId, reagentId: a.reagentId, reason: "used", change: -a.take,
          balanceAfter: updated.quantity, note: `Order ${order.barcode || order._id}`, byName, orderId: order._id,
        });
      }
      const missing = Math.round((rule.quantityPerRun - taken) * 1e6) / 1e6;
      if (missing > 1e-9) shortfalls.push({ reagentName: rule.reagentName, needed: rule.quantityPerRun, missing });
    }
    if (shortfalls.length) await labOrderModel.updateOne({ _id: order._id }, { $set: { reagentShortfalls: shortfalls } });
  } catch (e) {
    console.error("Reagent deduction failed:", e?.message);
  }
};

// ---------- instrument import ----------
export const newIngestKey = (analyzerId) => {
  const secret = crypto.randomBytes(24).toString("base64url");
  return { key: `${analyzerId}.${secret}`, hash: crypto.createHash("sha256").update(secret).digest("hex") };
};

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Stores values an instrument sent against the matching order. It never saves a result, changes the
// order's status or verifies anything: a person loads the values into the result form and saves them.
export const ingestInstrumentMessage = async ({ keyHeader, body }) => {
  const [id, secret] = String(keyHeader || "").split(".");
  if (!/^[0-9a-f]{24}$/i.test(id || "") || !secret) throw fail(401, "Unauthorised");
  const analyzer = await LabAnalyzer.findOne({ _id: id, isActive: true }).select("+ingestKeyHash").lean();
  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  const stored = analyzer?.ingestKeyHash || "";
  const same = stored.length === hash.length && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(hash));
  if (!analyzer || !same) throw fail(401, "Unauthorised");
  if (analyzer.status === "out_of_service") throw fail(409, "This analyzer is marked out of service.");

  let barcode;
  let observations;
  if (typeof body?.hl7 === "string") {
    const p = parseHl7Oru(body.hl7);
    if (p.errors.length) throw fail(400, p.errors.join(" "));
    ({ barcode, observations } = p);
  } else if (typeof body?.barcode === "string" && Array.isArray(body?.results)) {
    barcode = body.barcode.trim();
    observations = body.results.slice(0, 200).filter((r) => r?.code && r?.value !== undefined && r?.value !== "").map((r) => ({ code: String(r.code).slice(0, 40), value: String(r.value).slice(0, 200), unit: String(r.unit || "").slice(0, 30) }));
  } else {
    throw fail(400, "Send an HL7 message as hl7, or barcode and results.");
  }
  if (!barcode || !observations.length) throw fail(400, "No sample id or no results.");

  const order = await labOrderModel.findOne({ barcode, organizationId: analyzer.organizationId, recordStatus: "active" }).select("status testKey").lean();
  if (!order) throw fail(404, "No order with that sample id.");
  if (!["received", "processing", "quality-control"].includes(order.status)) throw fail(409, `The order is ${order.status}. Results are accepted from received to quality control.`);
  const def = STRUCTURED_TESTS.find((t) => t.key === order.testKey);
  if (!def) throw fail(409, "The order's test has no structured result fields.");

  const { entries, unmapped } = mapInstrumentResults(observations, analyzer.codeMap, def.analytes.map((a) => a.code));
  await labOrderModel.updateOne({ _id: order._id }, { $set: { instrumentResults: { analyzerId: analyzer._id, analyzerName: analyzer.name, receivedAt: new Date(), entries, unmapped, status: "pending" } } });
  return { accepted: entries.length, unmapped };
};
