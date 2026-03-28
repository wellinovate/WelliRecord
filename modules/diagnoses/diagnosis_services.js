import mongoose from "mongoose";
import { diagnosisModel } from "./diagnoses_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { UserProfile } from "../users/user_profile_model.js";

export const createDiagnosisService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const recordedBy = authUser?._id || authUser?.sub || null;
    const organizationId = authUser?.sub || payload.organizationId || null;

    if (!recordedBy) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

    // Optional: verify patient exists
    const patientFromUserProfile = await UserProfile.findById(
      payload.patientId,
    ).session(session);
    const patientFromPatientIdentity = await PatientIdentity.findById(
      payload.patientId,
    ).session(session);
    const check = patientFromUserProfile || patientFromPatientIdentity;
    if (!check) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }

    const docs = await diagnosisModel.create(
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
            payload.patientVisible !== undefined
              ? payload.patientVisible
              : true,

          diagnosisName: payload.diagnosisName,
          diagnosisType: payload.diagnosisType || "provisional",
          icd10Code: payload.icd10Code?.trim()?.toUpperCase() || undefined,
          clinicalStatus: payload.clinicalStatus || "active",

          onsetDate: payload.onsetDate || null,
          diagnosedAt: payload.diagnosedAt || new Date(),
          resolvedAt: payload.resolvedAt || null,

          diagnosedBy: recordedBy,
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
      diagnosisName: created.diagnosisName,
      diagnosisType: created.diagnosisType,
      icd10Code: created.icd10Code,
      clinicalStatus: created.clinicalStatus,
      onsetDate: created.onsetDate,
      diagnosedAt: created.diagnosedAt,
      resolvedAt: created.resolvedAt,
      diagnosedBy: created.diagnosedBy,
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

export const getPatientDiagnosesService = async ({
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
    diagnosisModel
      .find(filter)
      .sort({ diagnosedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    diagnosisModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      diagnosisName: item.diagnosisName,
      diagnosisType: item.diagnosisType || null,
      icd10Code: item.icd10Code || null,
      clinicalStatus: item.clinicalStatus || null,
      onsetDate: item.onsetDate || null,
      diagnosedAt: item.diagnosedAt || null,
      resolvedAt: item.resolvedAt || null,
      diagnosedBy: item.diagnosedBy || null,
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
