import mongoose from "mongoose";
import { immunizationModel } from "./immunizations_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";

export const createImmunizationService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const recordedBy = authUser?._id || authUser?.sub || null;
    const organizationId = authUser?.organizationId || payload.organizationId || null;

    if (!recordedBy) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

    const patient = await PatientIdentity.findById(payload.patientId).session(session);
    if (!patient) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }

    const docs = await immunizationModel.create(
      [
        {
          patientId: payload.patientId,
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
            payload.patientVisible !== undefined ? payload.patientVisible : true,

          vaccineName: payload.vaccineName,
          vaccineCode: payload.vaccineCode?.trim()?.toUpperCase() || undefined,
          manufacturer: payload.manufacturer || undefined,
          lotNumber: payload.lotNumber || undefined,
          doseNumber: payload.doseNumber || 1,
          series: payload.series || undefined,

          administrationRoute: payload.administrationRoute || "im",
          site: payload.site || undefined,

          administeredBy: recordedBy,
          administeredAt: payload.administeredAt || new Date(),
          nextDueDate: payload.nextDueDate || null,
          immunizationStatus: payload.immunizationStatus || "completed",

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
      vaccineName: created.vaccineName,
      vaccineCode: created.vaccineCode,
      manufacturer: created.manufacturer,
      lotNumber: created.lotNumber,
      doseNumber: created.doseNumber,
      series: created.series,
      administrationRoute: created.administrationRoute,
      site: created.site,
      administeredAt: created.administeredAt,
      nextDueDate: created.nextDueDate,
      immunizationStatus: created.immunizationStatus,
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

export const getPatientImmunizationsService = async ({
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
    immunizationModel
      .find(filter)
      .sort({ administeredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    immunizationModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      vaccineName: item.vaccineName,
      vaccineCode: item.vaccineCode || null,
      manufacturer: item.manufacturer || null,
      lotNumber: item.lotNumber || null,
      doseNumber: item.doseNumber || null,
      series: item.series || null,
      administrationRoute: item.administrationRoute || null,
      site: item.site || null,
      administeredAt: item.administeredAt || null,
      nextDueDate: item.nextDueDate || null,
      immunizationStatus: item.immunizationStatus || null,
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