import mongoose from "mongoose";
import { labOrderModel } from "./lab_order_model.js";
import { resolvePatientAccessContext, resolveActorContext } from "../vitals/vital_service.js";
import { UserProfile } from "../users/user_profile_model.js";
import { canTransition, canEnterResult, canVerify, isSelfVerified, generateBarcode, canReview, reviewerConflict, canRelease, canEditPatientNote, cleanReview, cleanPatientNote, buildPatientRecords } from "./lab_order_rules.js";
import { createLabResultService } from "../lab/lab_result_service.js";
import { notifyLabOrderReleased } from "../lab/lab_notifications.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { getEffectivePermissions } from "../team/permission_registry.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { STRUCTURED_TESTS } from "../lab-tests-catalog/lab_test_catalog_v2.js";
import { processResults, patientContext, summarise, summariseRanges, GENERIC_TEST } from "../lab-tests-catalog/lab_result_engine.js";
import { loadOverrides } from "../lab-ranges/lab_range_service.js";
import { applyOverrides } from "../lab-ranges/lab_range_rules.js";
import { deltaChecks } from "./lab_delta_rules.js";
import { deductReagentsForOrder } from "../lab-equipment/lab_equipment_automation.js";
import { LabCriticalAlert } from "./lab_critical_model.js";
import { sendSms } from "../../shared/utils/termii.js";
import { getIO } from "../../shared/realtime/socket.js";

const broadcast = (operationType, order) => {
  const io = getIO();
  if (!io) return;
  io.to(`org:${order.organizationId}`).emit("lab_order_change", {
    operationType,
    documentId: order.id,
    document: order,
  });
};

const serializeOrder = (item) => ({
  id: item._id,
  patientId: item.patientId,
  organizationId: item.organizationId,
  testName: item.testName,
  testKey: item.testKey,
  results: item.results,
  deltaFlags: item.deltaFlags,
  approval: item.approval,
  reviewLog: item.reviewLog,
  returnReason: item.returnReason,
  patientNote: item.patientNote,
  transmittedAt: item.transmittedAt,
  reagentShortfalls: item.reagentShortfalls,
  instrumentResults: item.instrumentResults,
  category: item.category,
  status: item.status,
  priority: item.priority,
  sampleType: item.sampleType,
  barcode: item.barcode,
  doctorName: item.doctorName,
  doctorPhone: item.doctorPhone,
  collector: item.collector,
  price: item.price,
  paymentStatus: item.paymentStatus,
  isCritical: item.isCritical,
  measuredValue: item.measuredValue,
  normalRange: item.normalRange,
  interpretation: item.interpretation,
  verifiedBy: item.verifiedBy,
  enteredByName: item.enteredByName,
  enteredAt: item.enteredAt,
  verifiedAt: item.verifiedAt,
  selfVerified: item.selfVerified,
  rejectionReason: item.rejectionReason,
  stageHistory: item.stageHistory,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Who is calling and which organisation they act for. Only organisation actors may
// touch lab orders; a patient token passes the permission middleware, so it is
// refused here. Orders created through this module store the organisation account id,
// older listing code used the organisation profile id, so both are accepted.
export const resolveLabScope = async (authUser) => {
  const actor = await resolveActorContext(authUser);
  if (!actor.isOrganizationActor || !actor.organizationId) {
    throw httpError("Lab access requires an organisation account", 403);
  }
  const profile = await OrganizationProfile.findOne({ accountId: actor.organizationId }).select("_id").lean();
  const organizationIds = [actor.organizationId, profile?._id].filter(Boolean);

  let name = actor.organizationName || null;
  if (!actor.isOrgOwner && authUser?.profileId) {
    const up = await UserProfile.findById(authUser.profileId).select("fullName").lean();
    name = up?.fullName || name;
  }
  return { actor, organizationIds, userId: String(actor.userId || ""), userName: name || "Staff" };
};

const findScopedOrder = async (id, organizationIds) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw httpError("Lab order not found", 404);
  // Not found and not yours look the same on purpose.
  const order = await labOrderModel.findOne({ _id: id, organizationId: { $in: organizationIds }, recordStatus: "active" });
  if (!order) throw httpError("Lab order not found", 404);
  return order;
};

const pushHistory = (order, status, scope) => {
  order.stageHistory.push({ status, at: new Date(), byUserId: scope.userId, byName: scope.userName });
};


// The test definition for an order with the lab's own ranges applied, and the same patient's
// last verified result of this test (for the delta check).
const definitionFor = async (order) => {
  if (!order.testKey) return GENERIC_TEST;
  const base = STRUCTURED_TESTS.find((t) => t.key === order.testKey);
  if (!base) return null;
  return applyOverrides(base, await loadOverrides(order.organizationId, order.testKey));
};

const deltasFor = async (order, rows) => {
  if (!order.testKey || !rows?.length) return [];
  const prev = await labOrderModel
    .findOne({
      _id: { $ne: order._id }, patientId: order.patientId, organizationId: order.organizationId, testKey: order.testKey,
      status: { $in: ["verified", "released", "delivered"] }, recordStatus: "active", "results.0": { $exists: true },
    })
    .sort({ verifiedAt: -1 })
    .select("results verifiedAt")
    .lean();
  return prev ? deltaChecks(rows, prev.results, prev.verifiedAt) : [];
};

// Writes the critical value to the log and tries to text the requesting doctor. A failed
// text never blocks saving the result; the log shows it and someone has to phone instead.
const recordCritical = async (order, patientName) => {
  if (!order.isCritical) {
    await LabCriticalAlert.deleteOne({ orderId: order._id, status: "open" });
    return;
  }
  const values = (order.results || []).filter((r) => r.critical).map((r) => ({ name: r.name, value: r.value, unit: r.unit, flag: r.flag }));
  const existing = await LabCriticalAlert.findOne({ orderId: order._id });
  if (existing?.sms === "sent" && existing.status === "open") {
    existing.values = values;
    await existing.save();
    return;
  }
  let sms = "no_phone";
  let smsError = "";
  if (order.doctorPhone) {
    try {
      await sendSms({ phoneNumber: order.doctorPhone, message: `CRITICAL LAB VALUE: ${patientName || "A patient"} - ${order.testName}. Check WelliRecord or call the lab now.` });
      sms = "sent";
    } catch (e) {
      sms = "failed";
      smsError = String(e?.message || "SMS failed").slice(0, 200);
    }
  }
  await LabCriticalAlert.findOneAndUpdate(
    { orderId: order._id },
    {
      $set: { organizationId: order.organizationId, patientId: order.patientId, patientName: patientName || "", testName: order.testName, values, enteredByName: order.enteredByName || "", doctorName: order.doctorName || "", sms, smsError },
      $setOnInsert: { status: "open" },
    },
    { upsert: true },
  );
};

export const listCriticalAlertsService = async ({ status, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const filter = { organizationId: { $in: scope.organizationIds } };
  if (status === "open" || status === "acknowledged") filter.status = status;
  return LabCriticalAlert.find(filter).sort({ createdAt: -1 }).limit(200).lean();
};

export const acknowledgeCriticalAlertService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) throw httpError("Alert not found", 404);
  const alert = await LabCriticalAlert.findOne({ _id: id, organizationId: { $in: scope.organizationIds } });
  if (!alert) throw httpError("Alert not found", 404);
  const notifiedTo = String(payload?.notifiedTo || "").trim();
  if (!notifiedTo) throw httpError("Say who was told.", 400);
  if (!["phone", "sms", "in_person", "other"].includes(payload?.method)) throw httpError("Say how they were told.", 400);
  Object.assign(alert, { status: "acknowledged", notifiedTo: notifiedTo.slice(0, 200), method: payload.method, note: String(payload.note || "").slice(0, 500), acknowledgedBy: scope.userName, acknowledgedAt: new Date() });
  await alert.save();
  return alert.toObject();
};

export const createLabOrderService = async ({ payload, authUser }) => {
  if (payload.testKey && !STRUCTURED_TESTS.some((t) => t.key === payload.testKey)) {
    throw httpError("That test is not in the catalog.", 400);
  }
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { actor, patientId } = await resolvePatientAccessContext({
      patientId: payload.patientId,
      authUser,
    });

    const recordedBy = actor.isOrganizationActor
      ? actor.organizationId
      : authUser?.sub || null;

    if (!recordedBy) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

    const organizationId = actor.isOrganizationActor ? actor.organizationId : null;

    const docs = await labOrderModel.create(
      [
        {
          patientId,
          recordedBy,
          providerId: recordedBy,
          organizationId,
          encounterId: payload.encounterId || null,

          source: payload.source || "lab",
          createdContext: "facility-chart",

          testName: payload.testName,
          testKey: payload.testKey || undefined,
          category: payload.category || "other",
          priority: payload.priority || "routine",
          sampleType: payload.sampleType || undefined,
          barcode: payload.barcode || generateBarcode(),
          doctorName: payload.doctorName || undefined,
          doctorPhone: payload.doctorPhone || undefined,
          collector: payload.collector || undefined,
          price: payload.price || 0,
          paymentStatus: payload.paymentStatus || "pending",
          notes: payload.notes || undefined,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    const order = serializeOrder(docs[0]);
    broadcast("insert", order);
    return order;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const getAllLabOrdersService = async ({ page = 1, limit = 20, authUser }) => {
  const scope = await resolveLabScope(authUser);

  const skip = (page - 1) * limit;
  const filter = { organizationId: { $in: scope.organizationIds }, recordStatus: "active" };

  const [items, total] = await Promise.all([
    labOrderModel
      .find(filter)
      .populate("patientId", "firstName fullName lastName email wrId phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    labOrderModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeOrder),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    viewer: { userId: scope.userId, canApprove: await callerCanApprove(authUser) },
  };
};

export const updateLabOrderStatusService = async ({ id, status, reason, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);

  if (status === "verified") {
    throw httpError("A result is verified with the verify step, not by changing the stage.", 409);
  }
  if (status === "released") {
    throw httpError("Results are released to the patient with the release step, after a senior has approved them.", 409);
  }
  if (!canTransition(order.status, status)) {
    throw httpError(`An order in ${order.status} cannot move to ${status}.`, 409);
  }
  if ((status === "rejected" || status === "cancelled") && !reason) {
    throw httpError("A reason is required to reject or cancel an order.", 400);
  }

  order.status = status;
  if (reason) order.rejectionReason = reason;
  pushHistory(order, status, scope);
  await order.save();

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

// Runs the entered values through the engine without saving, so the form can show flags and
// calculated values as the person types. Same checks and permissions as saving.
export const previewLabOrderResultService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);
  const def = await definitionFor(order);
  if (!def) throw httpError("This order's test is no longer in the catalog.", 409);
  const profile = await UserProfile.findById(order.patientId).select("gender dateOfBirth").lean();
  const out = processResults(def, payload.results || [], patientContext(profile || {}));
  // "Enter at least one result" is not an error while the form is still empty.
  const errors = out.errors.filter((e) => e !== "Enter at least one result.");
  return { results: out.results, isCritical: out.isCritical, errors, deltaFlags: await deltasFor(order, out.results) };
};

export const enterLabOrderResultService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);

  if (!canEnterResult(order.status)) {
    throw httpError(`Results can be entered while an order is processing or in quality control, not ${order.status}.`, 409);
  }

  // Structured entry: flags, critical status and calculated values come from the server.
  if (payload.results) {
    const def = await definitionFor(order);
    if (!def) throw httpError("This order's test is no longer in the catalog. Use the plain result fields.", 409);
    const profile = await UserProfile.findById(order.patientId).select("gender dateOfBirth").lean();
    const out = processResults(def, payload.results, patientContext(profile || {}));
    if (out.errors.length) throw httpError(out.errors.join(" "), 400);
    order.results = out.results;
    order.measuredValue = summarise(out.results);
    order.normalRange = summariseRanges(out.results);
    order.isCritical = out.isCritical;
    order.deltaFlags = await deltasFor(order, out.results);
    if (payload.interpretation !== undefined) order.interpretation = payload.interpretation;
  }

  // Only these fields come from the request. Who entered it comes from the token.
  if (!payload.results && payload.measuredValue !== undefined) order.measuredValue = payload.measuredValue;
  if (!payload.results && payload.normalRange !== undefined) order.normalRange = payload.normalRange;
  if (!payload.results && payload.interpretation !== undefined) order.interpretation = payload.interpretation;
  if (!payload.results && payload.isCritical !== undefined) order.isCritical = payload.isCritical;

  order.enteredBy = scope.userId;
  order.enteredByName = scope.userName;
  order.enteredAt = new Date();
  // Entering a result clears any earlier sign-off: it has to be verified again.
  order.verifiedBy = undefined;
  order.verifiedByUserId = undefined;
  order.verifiedAt = undefined;
  order.selfVerified = false;
  order.approval = undefined;
  order.returnReason = undefined;
  order.status = "quality-control";
  pushHistory(order, "quality-control", scope);
  await order.save();

  await deductReagentsForOrder(order, `Automatic (${scope.userName})`);
  if (order.instrumentResults && payload.results) await labOrderModel.updateOne({ _id: order._id }, { $set: { "instrumentResults.status": "used" } });
  const fresh = await labOrderModel.findById(order._id).select("reagentShortfalls instrumentResults reagentsDeductedAt").lean();
  order.reagentShortfalls = fresh?.reagentShortfalls;
  order.instrumentResults = fresh?.instrumentResults;

  const pr = await UserProfile.findById(order.patientId).select("fullName firstName lastName").lean();
  await recordCritical(order, pr?.fullName || [pr?.firstName, pr?.lastName].filter(Boolean).join(" "));

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const verifyLabOrderResultService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);

  if (!canVerify(order)) {
    throw httpError("Only an entered result waiting in quality control can be verified.", 409);
  }

  order.verifiedBy = scope.userName;
  order.verifiedByUserId = scope.userId;
  order.verifiedAt = new Date();
  // A small lab may have one scientist. That is allowed, but it is recorded.
  order.selfVerified = isSelfVerified(order.enteredBy, scope.userId);
  order.status = "verified";
  pushHistory(order, "verified", scope);
  await order.save();

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

// ---------- senior review, patient note, release ----------
// Whether the caller may approve results. The organisation owner can. A team member needs the
// permission through their role or an override. Unlike the route checks, this does not fail open.
export const callerCanApprove = async (authUser) => {
  if (authUser?.accountType === "organization") return true;
  if (!authUser?.profileId) return false;
  const m = await OrganizationMembership.findOne({ userId: authUser.profileId, isActive: true }).select("membershipRole permissionOverrides").lean();
  if (!m) return false;
  return getEffectivePermissions(m.membershipRole, m.permissionOverrides).includes("approve_lab_results");
};

export const reviewLabOrderService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  if (!(await callerCanApprove(authUser))) throw httpError("You do not have permission to approve lab results.", 403);
  const order = await findScopedOrder(id, scope.organizationIds);
  if (!canReview(order)) throw httpError("Only a verified result that has not been approved can be reviewed.", 409);
  if (reviewerConflict(order, scope.userId)) throw httpError("The person who entered or verified a result cannot approve it. Ask another senior to review.", 403);
  const { decision, comment } = (() => {
    const c = cleanReview(payload || {});
    if (c.errors.length) throw httpError(c.errors.join(" "), 400);
    return c.value;
  })();

  const entry = { decision, comment, byUserId: scope.userId, byName: scope.userName, at: new Date() };
  order.reviewLog = [...(order.reviewLog || []), entry];
  if (decision === "approve") {
    order.approval = { status: "approved", byUserId: scope.userId, byName: scope.userName, at: entry.at, comment };
    order.returnReason = undefined;
  } else {
    // Back to the bench: the result is corrected and verified again.
    order.approval = undefined;
    order.returnReason = comment;
    order.verifiedBy = undefined;
    order.verifiedByUserId = undefined;
    order.verifiedAt = undefined;
    order.selfVerified = false;
    order.status = "quality-control";
    pushHistory(order, "quality-control", scope);
  }
  await order.save();
  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const setPatientNoteService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);
  if (!canEditPatientNote(order)) throw httpError("The note cannot be changed after the result is released.", 409);
  const c = cleanPatientNote(payload || {});
  if (c.errors.length) throw httpError(c.errors.join(" "), 400);
  const wasApproved = order.approval?.status === "approved";
  order.patientNote = c.value.text ? { text: c.value.text, issueType: c.value.issueType, byUserId: scope.userId, byName: scope.userName, at: new Date() } : undefined;
  if (wasApproved) {
    // What the patient will read has changed, so the senior has to approve again.
    order.approval = undefined;
    order.reviewLog = [...(order.reviewLog || []), { decision: "approval_withdrawn", comment: "The patient note was changed.", byUserId: scope.userId, byName: scope.userName, at: new Date() }];
  }
  await order.save();
  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

// Sends an approved result to the patient's record and tells them once.
export const releaseLabOrderService = async ({ id, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);
  if (order.transmittedAt) throw httpError("This result has already been released.", 409);
  if (!canRelease(order)) throw httpError("A senior must approve the result before it is released to the patient.", 409);
  const records = buildPatientRecords(order);
  if (!records.length) throw httpError("There is no result to send. Enter the result first.", 409);
  const collected = (order.stageHistory || []).find((h) => h.status === "collected")?.at || null;
  const ids = [];
  for (const rec of records) {
    const created = await createLabResultService({
      payload: { ...rec, patientId: String(order.patientId), specimen: order.sampleType || undefined, collectedAt: collected, resultedAt: order.enteredAt || new Date(), verificationStatus: "lab-verified", source: "lab", skipNotify: true },
      authUser,
    });
    if (created?.id) ids.push(String(created.id));
  }

  order.transmittedAt = new Date();
  order.transmittedBy = scope.userName;
  order.transmittedResultIds = ids;
  order.status = "released";
  pushHistory(order, "released", scope);
  await order.save();

  const dispatch = await notifyLabOrderReleased({ patientId: order.patientId, testName: order.testName, isCritical: Boolean(order.isCritical), link: "/vault" });
  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return { order: serialized, recordsCreated: ids.length, dispatch };
};
