import mongoose from "mongoose";
import { medicationModel } from "./medications_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";

export const createMedicationService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { actor, patientId, isSelf } = await resolvePatientAccessContext({
      patientId: payload.patientId,
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

    if (!actor.userId) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

    if (actor.isPatientActor) {
      if (!isSelf) {
        const error = new Error("You can only create vitals for yourself");
        error.statusCode = 403;
        throw error;
      }
    }

    const source = actor.isPatientActor
      ? payload.source || "patient"
      : payload.source || "provider";

    const createdContext = actor.isPatientActor
      ? payload.createdContext || "patient-app"
      : payload.createdContext || "provider-chart";

    const docs = await medicationModel.create(
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

          medicationName: payload.medicationName,
          genericName: payload.genericName || undefined,
          brandName: payload.brandName || undefined,
          dosage: payload.dosage || undefined,
          form: payload.form || "other",
          route: payload.route || "oral",
          frequency: payload.frequency || undefined,
          duration: payload.duration || undefined,
          indication: payload.indication || undefined,

          prescribedBy: recordedBy,
          prescribedAt: payload.prescribedAt || new Date(),
          startDate: payload.startDate || null,
          endDate: payload.endDate || null,
          medicationStatus: payload.medicationStatus || "active",
          adherence: payload.adherence || "unknown",

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
      medicationName: created.medicationName,
      genericName: created.genericName,
      brandName: created.brandName,
      dosage: created.dosage,
      form: created.form,
      route: created.route,
      frequency: created.frequency,
      indication: created.indication,
      prescribedBy: created.prescribedBy,
      prescribedAt: created.prescribedAt,
      startDate: created.startDate,
      endDate: created.endDate,
      medicationStatus: created.medicationStatus,
      adherence: created.adherence,
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

export const getPatientMedicationsService = async ({
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
  console.log(
    "🚀 ~ getPatientMedicationsService ~ filter.patientIds:",
    patientIds,
  );

  const filter = {
    // patientId: patientIds,
    recordStatus: "active",
    // clinicalStatus: "active",
  };

  if (actor.isOrganizationActor) {
    filter.organizationId = organizationId;
  }

  const [items, total] = await Promise.all([
    medicationModel
      .find(filter)
      .populate("prescribedBy", "firstName fullName lastName email")
      .sort({ prescribedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    medicationModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      medicationName: item.medicationName,
      genericName: item.genericName || null,
      brandName: item.brandName || null,
      dosage: item.dosage || null,
      form: item.form || null,
      route: item.route || null,
      frequency: item.frequency || null,
      indication: item.indication || null,
      prescribedBy: item.prescribedBy?._id || null,
      prescribedByName: item.prescribedBy
        ? `${item.prescribedBy.firstName || ""} ${
            item.prescribedBy.lastName || ""
          }`.trim() || null
        : null,
      prescribedByEmail: item.prescribedBy?.email || null,
      prescribedByFullName: item.prescribedBy?.fullName || null,
      prescribedAt: item.prescribedAt || null,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      medicationStatus: item.medicationStatus || null,
      adherence: item.adherence || null,
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

export const getAllPatientMedicationsService = async ({
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
    medicationModel
      .find(filter)
      .populate("prescribedBy", "firstName fullName lastName email")
      .sort({ prescribedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    medicationModel.countDocuments(filter),
  ]);
  // console.log("🚀 ~ getAllPatientMedicationsService ~ items:", items)

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      medicationName: item.medicationName,
      genericName: item.genericName || null,
      brandName: item.brandName || null,
      dosage: item.dosage || null,
      form: item.form || null,
      route: item.route || null,
      frequency: item.frequency || null,
      duration: item.duration || null,
      indication: item.indication || null,
      prescribedBy: item.prescribedBy?._id || null,
      prescribedByName: item.prescribedBy
        ? `${item.prescribedBy.firstName || ""} ${
            item.prescribedBy.lastName || ""
          }`.trim() || null
        : null,
      prescribedByEmail: organization?.email || authUser?.email || null,
      prescribedByFullName: organization?.organizationName || null,
      prescribedAt: item.prescribedAt || null,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      medicationStatus: item.medicationStatus || null,
      adherence: item.adherence || null,
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
