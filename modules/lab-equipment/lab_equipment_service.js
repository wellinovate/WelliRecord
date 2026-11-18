import mongoose from "mongoose";
import { LabAnalyzer, LabAnalyzerEvent, LabReagent, LabReagentMovement, LabReagentUsage } from "./lab_equipment_models.js";
import { newIngestKey } from "./lab_equipment_automation.js";
import { STRUCTURED_TESTS } from "../lab-tests-catalog/lab_test_catalog_v2.js";
import { calibrationStatus, nextCalibrationDue, reagentStatus, cleanUsage, cleanCodeMap, cleanAnalyzer, cleanReagent, cleanMovement, cleanEvent } from "./lab_equipment_rules.js";
import { resolveLabScope } from "../lab-orders/lab_order_service.js";

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const orgOf = (scope) => scope.organizationIds[0];
const orgFilter = (scope) => ({ organizationId: { $in: scope.organizationIds } });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const check = ({ value, errors }) => { if (errors.length) throw httpError(errors.join(" "), 400); return value; };

const decorateAnalyzer = ({ ingestKeyHash, ...a }, now = new Date()) => ({
  ...a,
  ingestEnabled: Boolean(a.ingestKeySetAt),
  calibrationStatus: calibrationStatus(a, now),
  nextCalibrationDue: nextCalibrationDue(a),
});
const decorateReagent = (r, now = new Date()) => ({ ...r, stockStatus: reagentStatus(r, now) });

const findAnalyzer = async (id, scope) => {
  if (!validId(id)) throw httpError("Analyzer not found", 404);
  const a = await LabAnalyzer.findOne({ _id: id, ...orgFilter(scope), isActive: true });
  if (!a) throw httpError("Analyzer not found", 404);
  return a;
};
const findReagent = async (id, scope) => {
  if (!validId(id)) throw httpError("Reagent not found", 404);
  const r = await LabReagent.findOne({ _id: id, ...orgFilter(scope), isActive: true });
  if (!r) throw httpError("Reagent not found", 404);
  return r;
};

export const listAnalyzersService = async (authUser) => {
  const scope = await resolveLabScope(authUser);
  const rows = await LabAnalyzer.find({ ...orgFilter(scope), isActive: true }).sort({ name: 1 }).lean();
  return rows.map((a) => decorateAnalyzer(a));
};

export const createAnalyzerService = async ({ payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const value = check(cleanAnalyzer(payload || {}));
  const doc = await LabAnalyzer.create({ ...value, organizationId: orgOf(scope) });
  return decorateAnalyzer(doc.toObject());
};

export const updateAnalyzerService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const a = await findAnalyzer(id, scope);
  const value = check(cleanAnalyzer(payload || {}, { partial: true }));
  if (payload?.codeMap !== undefined) value.codeMap = check(cleanCodeMap(payload.codeMap));
  a.set(value);
  await a.save();
  return decorateAnalyzer(a.toObject());
};

export const retireAnalyzerService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const a = await findAnalyzer(id, scope);
  a.isActive = false;
  await a.save();
  return { removed: true };
};

export const addAnalyzerEventService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const a = await findAnalyzer(id, scope);
  const v = check(cleanEvent(payload || {}));
  const event = await LabAnalyzerEvent.create({ ...v, organizationId: a.organizationId, analyzerId: a._id, byName: scope.userName });
  // The register's "last" dates only move forward.
  if (v.type === "calibration" && (!a.lastCalibrationAt || v.performedAt > a.lastCalibrationAt)) a.lastCalibrationAt = v.performedAt;
  if (v.type === "qc" && (!a.lastQcAt || v.performedAt >= a.lastQcAt)) { a.lastQcAt = v.performedAt; a.lastQcResult = v.result; }
  await a.save();
  return { event: event.toObject(), analyzer: decorateAnalyzer(a.toObject()) };
};

export const listAnalyzerEventsService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const a = await findAnalyzer(id, scope);
  return LabAnalyzerEvent.find({ analyzerId: a._id, ...orgFilter(scope) }).sort({ performedAt: -1, createdAt: -1 }).limit(100).lean();
};

export const listReagentsService = async (authUser) => {
  const scope = await resolveLabScope(authUser);
  const rows = await LabReagent.find({ ...orgFilter(scope), isActive: true }).sort({ name: 1, expiresOn: 1 }).lean();
  return rows.map((r) => decorateReagent(r));
};

export const createReagentService = async ({ payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const value = check(cleanReagent(payload || {}));
  if (value.analyzerId) await findAnalyzer(value.analyzerId, scope);
  const start = Number(payload?.quantity ?? 0);
  if (!Number.isFinite(start) || start < 0 || start > 1e6) throw httpError("Starting quantity must be zero or more.", 400);
  const doc = await LabReagent.create({ ...value, quantity: start, organizationId: orgOf(scope) });
  if (start > 0) {
    await LabReagentMovement.create({ organizationId: doc.organizationId, reagentId: doc._id, reason: "received", change: start, balanceAfter: start, note: "Opening stock", byName: scope.userName });
  }
  return decorateReagent(doc.toObject());
};

export const updateReagentService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const r = await findReagent(id, scope);
  const value = check(cleanReagent(payload || {}, { partial: true }));
  if (value.analyzerId) await findAnalyzer(value.analyzerId, scope);
  r.set(value); // quantity changes only through movements, so the log stays complete
  await r.save();
  return decorateReagent(r.toObject());
};

export const retireReagentService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const r = await findReagent(id, scope);
  r.isActive = false;
  await r.save();
  return { removed: true };
};

export const addMovementService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const r = await findReagent(id, scope);
  const v = check(cleanMovement(payload || {}));
  // One atomic update: stock never goes below zero, even with two people recording at once.
  const updated = await LabReagent.findOneAndUpdate(
    { _id: r._id, quantity: { $gte: v.change < 0 ? -v.change : 0 } },
    { $inc: { quantity: v.change } },
    { new: true },
  ).lean();
  if (!updated) throw httpError(`Only ${r.quantity} ${r.unit || "units"} in stock.`, 409);
  const movement = await LabReagentMovement.create({ organizationId: r.organizationId, reagentId: r._id, reason: v.reason, change: v.change, balanceAfter: updated.quantity, note: v.note, byName: scope.userName });
  return { movement: movement.toObject(), reagent: decorateReagent(updated) };
};

export const listMovementsService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const r = await findReagent(id, scope);
  return LabReagentMovement.find({ reagentId: r._id, ...orgFilter(scope) }).sort({ createdAt: -1 }).limit(100).lean();
};

export const equipmentSummaryService = async (authUser) => {
  const [analyzers, reagents] = await Promise.all([listAnalyzersService(authUser), listReagentsService(authUser)]);
  const count = (list, key, val) => list.filter((x) => x[key] === val).length;
  return {
    analyzers: { total: analyzers.length, overdue: count(analyzers, "calibrationStatus", "overdue"), dueSoon: count(analyzers, "calibrationStatus", "due_soon"), outOfService: count(analyzers, "status", "out_of_service"), qcFailed: analyzers.filter((a) => a.lastQcResult === "fail").length },
    reagents: { total: reagents.length, expired: count(reagents, "stockStatus", "expired"), expiring: count(reagents, "stockStatus", "expiring"), low: count(reagents, "stockStatus", "low"), empty: count(reagents, "stockStatus", "empty") },
  };
};

// Makes a new key for the analyzer's instrument interface. The key is shown once and only a hash is kept.
export const createIngestKeyService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const a = await findAnalyzer(id, scope);
  const { key, hash } = newIngestKey(String(a._id));
  await LabAnalyzer.updateOne({ _id: a._id }, { $set: { ingestKeyHash: hash, ingestKeySetAt: new Date() } });
  return { key };
};

export const revokeIngestKeyService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const a = await findAnalyzer(id, scope);
  await LabAnalyzer.updateOne({ _id: a._id }, { $set: { ingestKeyHash: "" }, $unset: { ingestKeySetAt: 1 } });
  return { revoked: true };
};

export const listUsageService = async (authUser) => {
  const scope = await resolveLabScope(authUser);
  return LabReagentUsage.find(orgFilter(scope)).sort({ testKey: 1, reagentName: 1 }).lean();
};

export const setUsageService = async ({ payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const v = check(cleanUsage(payload || {}));
  if (!STRUCTURED_TESTS.some((t) => t.key === v.testKey)) throw httpError("That test is not in the catalog.", 404);
  const exists = await LabReagent.exists({ ...orgFilter(scope), isActive: true, name: new RegExp(`^${v.reagentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (!exists) throw httpError("Add the reagent to the list first.", 404);
  return LabReagentUsage.findOneAndUpdate(
    { organizationId: orgOf(scope), testKey: v.testKey, reagentName: v.reagentName },
    { $set: { quantityPerRun: v.quantityPerRun, note: v.note } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
};

export const removeUsageService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  if (!validId(id)) throw httpError("Not found", 404);
  await LabReagentUsage.deleteOne({ _id: id, ...orgFilter(scope) });
  return { removed: true };
};
