import mongoose from "mongoose";
import { labOrderModel } from "./lab_order_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
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
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

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
          barcode: payload.barcode || `BC-${Date.now()}`,
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
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found for this account");
    err.statusCode = 404;
    throw err;
  }

  const skip = (page - 1) * limit;
  const filter = { organizationId: organization._id, recordStatus: "active" };

  const [items, total] = await Promise.all([
    labOrderModel
      .find(filter)
      .populate("patientId", "firstName fullName lastName email")
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

export const updateLabOrderStatusService = async ({ id, status }) => {
  const order = await labOrderModel.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (!order) {
    const err = new Error("Lab order not found");
    err.statusCode = 404;
    throw err;
  }

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const enterLabOrderResultService = async ({ id, payload }) => {
  const update = {
    ...payload,
    status: "verified",
  };

  const order = await labOrderModel.findByIdAndUpdate(id, update, { new: true });

  if (!order) {
    const err = new Error("Lab order not found");
    err.statusCode = 404;
    throw err;
  }

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};
