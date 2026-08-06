import mongoose from "mongoose";
import { pharmacyOrderModel } from "./pharmacy_order_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { getIO } from "../../shared/realtime/socket.js";

const broadcast = (operationType, order) => {
  const io = getIO();
  if (!io) return;
  io.to(`org:${order.organizationId}`).emit("pharmacy_order_change", {
    operationType,
    documentId: order.id,
    document: order,
  });
};

const serializeOrder = (item) => ({
  id: item._id,
  patientId: item.patientId,
  organizationId: item.organizationId,
  medicationName: item.medicationName,
  dosage: item.dosage,
  quantity: item.quantity,
  instructions: item.instructions,
  status: item.status,
  priority: item.priority,
  barcode: item.barcode,
  prescribedByName: item.prescribedByName,
  prescribedByPhone: item.prescribedByPhone,
  dispensedBy: item.dispensedBy,
  price: item.price,
  paymentStatus: item.paymentStatus,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const createPharmacyOrderService = async ({ payload, authUser }) => {
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

    const docs = await pharmacyOrderModel.create(
      [
        {
          patientId,
          recordedBy,
          providerId: recordedBy,
          organizationId,
          encounterId: payload.encounterId || null,

          source: payload.source || "pharmacy",
          createdContext: "facility-chart",

          medicationName: payload.medicationName,
          dosage: payload.dosage || undefined,
          quantity: payload.quantity || 1,
          instructions: payload.instructions || undefined,
          priority: payload.priority || "routine",
          barcode: payload.barcode || `RX-${Date.now()}`,
          prescribedByName: payload.prescribedByName || undefined,
          prescribedByPhone: payload.prescribedByPhone || undefined,
          price: payload.price || 0,
          paymentStatus: payload.paymentStatus || "pending",
          notes: payload.notes || undefined,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    await docs[0].populate("patientId", "firstName fullName lastName email");

    const order = serializeOrder(docs[0]);
    broadcast("insert", order);
    return order;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const getAllPharmacyOrdersService = async ({ page = 1, limit = 20, authUser }) => {
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
    pharmacyOrderModel
      .find(filter)
      .populate("patientId", "firstName fullName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    pharmacyOrderModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeOrder),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const updatePharmacyOrderStatusService = async ({ id, status }) => {
  const order = await pharmacyOrderModel.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (!order) {
    const err = new Error("Pharmacy order not found");
    err.statusCode = 404;
    throw err;
  }

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const dispensePharmacyOrderService = async ({ id, payload }) => {
  const update = {
    ...payload,
    status: "dispensed",
  };

  const order = await pharmacyOrderModel.findByIdAndUpdate(id, update, { new: true });

  if (!order) {
    const err = new Error("Pharmacy order not found");
    err.statusCode = 404;
    throw err;
  }

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};
