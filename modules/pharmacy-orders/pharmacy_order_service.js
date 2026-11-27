import mongoose from "mongoose";
import { pharmacyOrderModel } from "./pharmacy_order_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { getIO } from "../../shared/realtime/socket.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { resolveGranteeIds, findActiveAccessGrant } from "../access/access_grant_service.js";
import { medicationModel } from "../medications/medications_model.js";

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

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Orders store the organization's account id, while other records use the
// OrganizationProfile id, so a pharmacy is matched on either form.
const resolveOrgScope = async (authUser) => {
  const actor = await resolveActorContext(authUser);
  if (!actor?.isOrganizationActor || !actor.organizationId) {
    throw httpError("Only an organization account can manage pharmacy orders", 403);
  }
  const ids = await resolveGranteeIds({ organizationId: actor.organizationId });
  const organizationIds = ids?.organizationIds?.length ? ids.organizationIds : [actor.organizationId];
  return { actor, organizationIds };
};

export const getAllPharmacyOrdersService = async ({ page = 1, limit = 20, authUser }) => {
  const { organizationIds } = await resolveOrgScope(authUser);

  const skip = (page - 1) * limit;
  const filter = { organizationId: { $in: organizationIds }, recordStatus: "active" };

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

export const updatePharmacyOrderStatusService = async ({ id, status, authUser }) => {
  if (status === "dispensed") {
    throw httpError("Use the dispense action to dispense an order", 400);
  }
  const { organizationIds } = await resolveOrgScope(authUser);

  const order = await pharmacyOrderModel.findOneAndUpdate(
    { _id: id, organizationId: { $in: organizationIds } },
    { status },
    { new: true },
  );

  if (!order) throw httpError("Pharmacy order not found", 404);

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const dispensePharmacyOrderService = async ({ id, payload, authUser }) => {
  const { actor, organizationIds } = await resolveOrgScope(authUser);

  const existing = await pharmacyOrderModel.findOne({
    _id: id,
    organizationId: { $in: organizationIds },
  });
  if (!existing) throw httpError("Pharmacy order not found", 404);
  if (existing.status === "dispensed") throw httpError("This order has already been dispensed", 409);

  // Consent can be withdrawn after the order was created, so check it again
  // before anything is written to the patient's record.
  const grant = await findActiveAccessGrant({
    patientId: existing.patientId,
    userId: actor.userId,
    organizationId: actor.organizationId,
    category: "medications",
  });
  if (!grant || grant.permissions?.write !== true) {
    throw httpError("This patient has not granted write access for medications.", 403);
  }

  const previousStatus = existing.status;
  const order = await pharmacyOrderModel.findOneAndUpdate(
    { _id: existing._id, status: { $ne: "dispensed" } },
    { ...payload, status: "dispensed" },
    { new: true },
  );
  if (!order) throw httpError("This order has already been dispensed", 409);

  try {
    await medicationModel.create({
      patientId: order.patientId,
      recordedBy: order.organizationId,
      providerId: order.organizationId,
      organizationId: order.organizationId,
      source: "provider",
      createdContext: "provider-chart",
      ownershipType: "shared",
      visibility: "shared",
      patientAccess: "full",
      patientVisible: true,
      medicationName: order.medicationName,
      dosage: order.dosage || undefined,
      form: "other",
      route: "oral",
      prescribedBy: order.organizationId,
      prescribedAt: new Date(),
      medicationStatus: "active",
      adherence: "unknown",
      scheduleTimes: [],
      reminderEnabled: false,
      notes: order.instructions || undefined,
    });
  } catch (error) {
    await pharmacyOrderModel.updateOne({ _id: order._id }, { status: previousStatus });
    throw error;
  }

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};
