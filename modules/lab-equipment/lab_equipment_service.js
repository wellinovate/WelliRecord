import mongoose from "mongoose";
import { LabAnalyzer, LabAnalyzerEvent, LabReagent, LabReagentMovement } from "./lab_equipment_models.js";
import { calibrationStatus, nextCalibrationDue, reagentStatus, cleanAnalyzer, cleanReagent, cleanMovement, cleanEvent } from "./lab_equipment_rules.js";
import { resolveLabScope } from "../lab-orders/lab_order_service.js";

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const orgOf = (scope) => scope.organizationIds[0];
const orgFilter = (scope) => ({ organizationId: { $in: scope.organizationIds } });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const check = ({ value, errors }) => { if (errors.length) throw httpError(errors.join(" "), 400); return value; };

const decorateAnalyzer = (a, now = new Date()) => ({
  ...a,
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
