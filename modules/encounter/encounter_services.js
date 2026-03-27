import mongoose from "mongoose";
import { Encounter } from "./encounter_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";

export const createEncounterService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const createdBy = authUser?._id || authUser?.sub || null;
    const providerId = authUser?._id || authUser?.sub || null;
    const organizationId = authUser?.organizationId || null;

    if (!createdBy || !providerId) {
      const error = new Error("Authenticated provider is required");
      error.statusCode = 401;
      throw error;
    }

    if (!organizationId) {
      const error = new Error("Organization context is required");
      error.statusCode = 403;
      throw error;
    }

    const patient = await PatientIdentity.findById(payload.patientId).session(session);
    if (!patient) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }

    const docs = await Encounter.create(
      [
        {
          patientId: payload.patientId,
          providerId,
          organizationId,
          createdBy,

          encounterType: payload.encounterType || "outpatient",
          scheduledAt: payload.scheduledAt || null,
          startedAt: payload.startedAt || new Date(),
          endedAt: payload.endedAt || null,

          reasonForVisit: payload.reasonForVisit || null,
          chiefComplaint: payload.chiefComplaint || null,

          priority: payload.priority || "routine",
          source: payload.source || "provider",
          status: payload.status || "scheduled",

          visibilityToPatient:
            payload.visibilityToPatient !== undefined
              ? payload.visibilityToPatient
              : true,

          patientAccess: payload.patientAccess || "full",
          recordStatus: payload.recordStatus || "active",

          notes: payload.notes || null,
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
      providerId: created.providerId,
      organizationId: created.organizationId,
      encounterType: created.encounterType,
      scheduledAt: created.scheduledAt,
      startedAt: created.startedAt,
      endedAt: created.endedAt,
      reasonForVisit: created.reasonForVisit,
      chiefComplaint: created.chiefComplaint,
      priority: created.priority,
      source: created.source,
      status: created.status,
      visibilityToPatient: created.visibilityToPatient,
      patientAccess: created.patientAccess,
      recordStatus: created.recordStatus,
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

export const getPatientEncountersService = async ({
  patientId,
  page = 1,
  limit = 10,
  authUser,
}) => {
  const organizationId = authUser?.organizationId || null;
  const skip = (page - 1) * limit;

  const filter = {
    patientId,
    recordStatus: "active",
  };

  if (organizationId) {
    filter.organizationId = organizationId;
  }

  const [items, total] = await Promise.all([
    Encounter.find(filter)
      .sort({ startedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Encounter.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      providerId: item.providerId,
      organizationId: item.organizationId,
      encounterType: item.encounterType,
      scheduledAt: item.scheduledAt || null,
      startedAt: item.startedAt || null,
      endedAt: item.endedAt || null,
      reasonForVisit: item.reasonForVisit || null,
      chiefComplaint: item.chiefComplaint || null,
      priority: item.priority || null,
      source: item.source || null,
      status: item.status || null,
      visibilityToPatient: item.visibilityToPatient,
      patientAccess: item.patientAccess || null,
      recordStatus: item.recordStatus || null,
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