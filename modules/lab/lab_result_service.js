import mongoose from "mongoose";
import { labResultModel } from "./lab_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";

export const createLabResultService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const patientId = payload.patientId;

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

    const docs = await labResultModel.create(
      [
        {
          patientId: patientIds,
          recordedBy,
          providerId: recordedBy,
          organizationId,
          encounterId: payload.encounterId || null,

          source: payload.source || "lab",
          createdContext: payload.createdContext || "facility-chart",
          ownershipType: payload.ownershipType || "shared",
          visibility: payload.visibility || "shared",
          patientAccess: payload.patientAccess || "full",
          patientVisible:
            payload.patientVisible !== undefined
              ? payload.patientVisible
              : true,

          testName: payload.testName,
          category: payload.category || "other",
          specimen: payload.specimen || undefined,
          resultValue: payload.resultValue || undefined,
          unit: payload.unit || undefined,
          referenceRange: payload.referenceRange || undefined,
          interpretation: payload.interpretation || "unknown",

          orderedBy: recordedBy,
          performedBy: recordedBy,
          collectedAt: payload.collectedAt || null,
          resultedAt: payload.resultedAt || new Date(),

          verificationStatus: payload.verificationStatus || "provider-reviewed",
          notes: payload.notes || undefined,
          attachments: payload.attachments || [],
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
      testName: created.testName,
      category: created.category,
      specimen: created.specimen,
      resultValue: created.resultValue,
      unit: created.unit,
      referenceRange: created.referenceRange,
      interpretation: created.interpretation,
      collectedAt: created.collectedAt,
      resultedAt: created.resultedAt,
      verificationStatus: created.verificationStatus,
      attachments: created.attachments || [],
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

export const getPatientLabResultsService = async ({
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

  if (actor.isOrganizationActor) {
    filter.organizationId = organizationId;
  }

  const [items, total] = await Promise.all([
    labResultModel
      .find(filter)
      .sort({ resultedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    labResultModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      testName: item.testName,
      category: item.category || null,
      specimen: item.specimen || null,
      resultValue: item.resultValue || null,
      unit: item.unit || null,
      referenceRange: item.referenceRange || null,
      interpretation: item.interpretation || null,
      collectedAt: item.collectedAt || null,
      resultedAt: item.resultedAt || null,
      verificationStatus: item.verificationStatus || null,
      attachments: item.attachments || [],
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

export const getAllPatientLabResultsService = async ({
  page = 1,
  limit = 10,
  authUser,
}) => {
  
  let organizationId;
    const wrOrgId = authUser?.orgId || null;
    const organization = await OrganizationProfile.findOne({
      wrOrgId: wrOrgId,
    });
    organizationId = organization._id;
    const skip = (page - 1) * limit;
  
    const filter = {
      organizationId: organizationId,
      // recordStatus: "active",
    };

  

  const [items, total] = await Promise.all([
    labResultModel
      .find(filter)
      .populate("patientId", "firstName fullName lastName email")
      .sort({ resultedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    labResultModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      testName: item.testName,
      category: item.category || null,
      specimen: item.specimen || null,
      resultValue: item.resultValue || null,
      unit: item.unit || null,
      referenceRange: item.referenceRange || null,
      interpretation: item.interpretation || null,
      collectedAt: item.collectedAt || null,
      resultedAt: item.resultedAt || null,
      verificationStatus: item.verificationStatus || null,
      attachments: item.attachments || [],
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
