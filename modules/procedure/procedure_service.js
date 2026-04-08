import mongoose from "mongoose";
import { procedureModel } from "./procedure_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";

export const createProcedureService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const patientId = payload.patientId

  try {
    const {
      actor,
      patientId: patientIds,
      isSelf,
    } = await resolvePatientAccessContext({
      patientId,
      authUser,
    });
    let recordedBy = null;

    // const organizationIdFromUser = authUser?.sub || null;
    if (actor.isOrganizationActor === true) {
      recordedBy = actor.organizationId;
      console.log("🚀 ~ createVitalService ~ recordedBy:", recordedBy);
    } else {
      recordedBy = authUser?.sub || null;
    }
    const organizationId = actor.isOrganizationActor
      ? actor.organizationId
      : null;

    if (!recordedBy) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

  

    const docs = await procedureModel.create(
      [
        {
          patientId: patientIds,
          recordedBy,
          providerId: recordedBy,
          organizationId,
          encounterId: payload.encounterId || null,

          source: payload.source || "provider",
          createdContext: payload.createdContext || "provider-chart",
          ownershipType: payload.ownershipType || "shared",
          visibility: payload.visibility || "shared",
          patientAccess: payload.patientAccess || "full",
          patientVisible:
            payload.patientVisible !== undefined
              ? payload.patientVisible
              : true,

          procedureName: payload.procedureName,
          procedureType: payload.procedureType || "other",
          bodySite: payload.bodySite || undefined,
          indication: payload.indication || undefined,
          outcome: payload.outcome || "unknown",
          complications: payload.complications || undefined,

          performedBy: recordedBy,
          facilityName: payload.facilityName || actor.organizationName,
          performedAt: payload.performedAt || new Date(),
          clinicalStatus: payload.clinicalStatus || "completed",

          notes: payload.notes || undefined,
        },
      ],
      { session },
    );

    const created = docs[0];

    await session.commitTransaction();
    session.endSession();

    return {
      id: created._id,
      patientId: created.patientId,
      encounterId: created.encounterId,
      procedureName: created.procedureName,
      procedureType: created.procedureType,
      bodySite: created.bodySite,
      indication: created.indication,
      outcome: created.outcome,
      complications: created.complications,
      performedBy: created.performedBy,
      facilityName: created.facilityName,
      performedAt: created.performedAt,
      clinicalStatus: created.clinicalStatus,
      notes: created.notes,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const getPatientProceduresService = async ({
  patientId,
  page = 1,
  limit = 10,
  authUser,
}) => {

   const {
      actor,
      patientId: patientIds,
      isSelf,
    } = await resolvePatientAccessContext({
      patientId,
      authUser,
    });

  const organizationId = actor.isOrganizationActor && actor.organizationId;
  const skip = (page - 1) * limit;

  const filter = {
    patientId: patientIds,
    recordStatus: "active",
  };

  if (organizationId) {
    filter.organizationId = organizationId;
  }

  const [items, total] = await Promise.all([
    procedureModel
      .find(filter)
      .populate("performedBy", "organizationName fullName  email")
      .sort({ performedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    procedureModel.countDocuments(filter),
  ]);
  console.log("🚀 ~ getPatientProceduresService ~ items:", items)

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      encounterId: item.encounterId || null,
      procedureName: item.procedureName,
      procedureType: item.procedureType || null,
      bodySite: item.bodySite || null,
      indication: item.indication || null,
      outcome: item.outcome || null,
      complications: item.complications || null,
      performedBy: item.performedBy || null,
      facilityName: item.facilityName || null,
      performedAt: item.performedAt || null,
      clinicalStatus: item.clinicalStatus || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
