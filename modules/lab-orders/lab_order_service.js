import mongoose from "mongoose";
import { labOrderModel } from "./lab_order_model.js";
import { resolvePatientAccessContext, resolveActorContext } from "../vitals/vital_service.js";
import { UserProfile } from "../users/user_profile_model.js";
import { canTransition, canEnterResult, canVerify, isSelfVerified, generateBarcode } from "./lab_order_rules.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
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
const resolveLabScope = async (authUser) => {
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

export const createLabOrderService = async ({ payload, authUser }) => {
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
  };
};

export const updateLabOrderStatusService = async ({ id, status, reason, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);

  if (status === "verified") {
    throw httpError("A result is verified with the verify step, not by changing the stage.", 409);
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

export const enterLabOrderResultService = async ({ id, payload, authUser }) => {
  const scope = await resolveLabScope(authUser);
  const order = await findScopedOrder(id, scope.organizationIds);

  if (!canEnterResult(order.status)) {
    throw httpError(`Results can be entered while an order is processing or in quality control, not ${order.status}.`, 409);
  }

  // Only these fields come from the request. Who entered it comes from the token.
  if (payload.measuredValue !== undefined) order.measuredValue = payload.measuredValue;
  if (payload.normalRange !== undefined) order.normalRange = payload.normalRange;
  if (payload.interpretation !== undefined) order.interpretation = payload.interpretation;
  if (payload.isCritical !== undefined) order.isCritical = payload.isCritical;

  order.enteredBy = scope.userId;
  order.enteredByName = scope.userName;
  order.enteredAt = new Date();
  // Entering a result clears any earlier sign-off: it has to be verified again.
  order.verifiedBy = undefined;
  order.verifiedByUserId = undefined;
  order.verifiedAt = undefined;
  order.selfVerified = false;
  order.status = "quality-control";
  pushHistory(order, "quality-control", scope);
  await order.save();

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
