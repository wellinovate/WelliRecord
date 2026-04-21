import mongoose from "mongoose";
import { Encounter } from "./encounter_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { vitalModel } from "../vitals/vitals_model.js";
import { diagnosisModel } from "../diagnoses/diagnoses_model.js";
import { medicationModel } from "../medications/medications_model.js";
import { labResultModel } from "../lab/lab_model.js";
import { procedureModel } from "../procedure/procedure_model.js";
import { allergyModel } from "../allergies/allergies_model.js";
import { immunizationModel } from "../immunizations/immunizations_model.js";
import { generateEncounterCode } from "../../shared/utils/helper.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { Account } from "../accounts/account_model.js";

export const createEncounterService = async ({ payload, authUser }) => {
  console.log("🚀 ~ createEncounterService ~ authUser:", authUser);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      actor,
      patientId: patientIds,
      isSelf,
    } = await resolvePatientAccessContext({
      patientId: payload.patientId,
      authUser,
    });

    const wrOrgId = actor.wrOrgId || authUser?.orgId || null;
    console.log("🚀 ~ createEncounterService ~ wrOrgId:", wrOrgId);

    const organization = await OrganizationProfile.findOne({
      wrOrgId: wrOrgId,
    });
    const organizationId = organization._id;
    // const accounId = await Account.findOne({ accountId: authUser?.sub });
    // console.log("🚀 ~ createEncounterService ~ accounId:", accounId)
    console.log(
      "🚀 ~ createEncounterService ~ organizationId:",
      organizationId,
    );

    const createdBy = actor?._id || authUser?.sub || null;
    const providerId = authUser?._id || authUser?.sub || null;

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

    const encounterCode = await generateEncounterCode(Encounter);
    const encounterTitle = getEncounterDisplayTitle(payload);

    const docs = await Encounter.create(
      [
        {
          patientId: patientIds,
          providerId,
          organizationId,
          createdBy,

          encounterTitle,
          encounterType: payload.encounterType || "outpatient",
          encounterCode: encounterCode,
          //       scheduledAt: payload.scheduledAt || null,
          startedAt: payload.startedAt || new Date(),
          endedAt: payload.endedAt || null,

          reasonForVisit: payload.reasonForVisit || null,
          chiefComplaint: payload.chiefComplaint || null,

          //       priority: payload.priority || "routine",
          source: payload.providerId || "provider",
          status: payload.status || "scheduled",
          notes: payload.notes || null,

          //       recordStatus: payload.recordStatus || "active",
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
      // scheduledAt: created.scheduledAt,
      startedAt: created.startedAt,
      endedAt: created.endedAt,
      reasonForVisit: created.reasonForVisit,
      chiefComplaint: created.chiefComplaint,
      priority: created.priority,
      source: created.source,
      status: created.status,
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
  const {
    actor,
    patientId: patientIds,
    isSelf,
  } = await resolvePatientAccessContext({
    patientId,
    authUser,
  });
  // const organizationId = authUser?.organizationId || null;
  let organizationId = authUser?.sub || null;
  const skip = (page - 1) * limit;
  if (actor.isOrganizationActor) {
    const wrOrgId = actor.wrOrgId || authUser?.orgId || null;
    const organization = await OrganizationProfile.findOne({
      wrOrgId: wrOrgId,
    });
    organizationId = organization._id;
  }

  const filter = {
    patientId: patientIds,
    recordStatus: "active",
  };

  if (actor.isOrganizationActor) {
    filter.organizationId = organizationId;
  }

  const [items, total] = await Promise.all([
    Encounter.find(filter)
      .populate({
        path: "organizationId",
        select: "email fullName organizationName contactPersonName name",
      })
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

      organizationId: item.organizationId?._id || null,
      organizationPersonName: item.organizationId?.contactPersonName,
      organizationName:
        item.organizationId?.organizationName ||
        item.organizationId?.name ||
        item.organizationId?.fullName ||
        null,
      organizationEmail: item.organizationId?.email || null,

      encounterTitle: item.encounterTitle || null,
      encounterType: item.encounterType,
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

  // return {
  //   items: items.map((item) => ({
  //     id: item._id,
  //     patientId: item.patientId,
  //     providerId: item.providerId,
  //     organizationId: item.organizationId?._id,
  //     organizationName: item.organizationId?.email || null,
  //     organizationFullName: item.organizationId?.fullName || null,
  //     encounterTitle: item.encounterTitle || null,
  //     encounterType: item.encounterType,
  //     scheduledAt: item.scheduledAt || null,
  //     startedAt: item.startedAt || null,
  //     endedAt: item.endedAt || null,
  //     reasonForVisit: item.reasonForVisit || null,
  //     chiefComplaint: item.chiefComplaint || null,
  //     priority: item.priority || null,
  //     source: item.source || null,
  //     status: item.status || null,
  //     visibilityToPatient: item.visibilityToPatient,
  //     patientAccess: item.patientAccess || null,
  //     recordStatus: item.recordStatus || null,
  //     notes: item.notes || null,
  //     createdAt: item.createdAt,
  //     updatedAt: item.updatedAt,
  //   })),
  //   pagination: {
  //     total,
  //     page,
  //     limit,
  //     totalPages: Math.ceil(total / limit),
  //   },
  // };
};

export const getPatientEncountersDetailService = async ({
  id,
  patientId,
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
  const organizationId = authUser?.organizationId || null;

  const filter = {
    patientId: patientIds,
    recordStatus: "active",
  };

  if (actor.isOrganizationActor) {
    filter.organizationId = organizationId;
  }
  const encounterId = id;

  const encounter = await Encounter.findOne({
    _id: encounterId,
  })
    .populate("organizationId", "firstName fullName lastName email")
    .lean();

  if (!encounter) {
    const error = new Error("Encounter not found");
    error.statusCode = 404;
    throw error;
  }

  const [
    vitals,
    diagnoses,
    medications,
    labResults,
    procedures,
    allergies,
    immunizations,
    // files,
  ] = await Promise.all([
    vitalModel
      .find({ encounterId })
      .sort({ recordedAt: -1, createdAt: -1 })
      .lean(),
    diagnosisModel.find({ encounterId }).sort({ createdAt: -1 }).lean(),
    medicationModel
      .find({ encounterId })
      .sort({ prescribedAt: -1, createdAt: -1 })
      .lean(),
    labResultModel
      .find({ encounterId })
      .sort({ resultDate: -1, createdAt: -1 })
      .lean(),
    procedureModel
      .find({ encounterId })
      .sort({ performedAt: -1, createdAt: -1 })
      .lean(),
    allergyModel.find({ encounterId }).sort({ createdAt: -1 }).lean(),
    immunizationModel
      .find({ encounterId })
      .sort({ administeredAt: -1, createdAt: -1 })
      .lean(),
    // FileModel.find({ encounterId }).sort({ createdAt: -1 }).lean(),
  ]);

  return {
    encounter: {
      id: String(encounter._id),
      encounterName: encounter.encounterName || null,
      encounterCode: encounter.encounterCode || null,
      patientId: encounter.patientId,
      providerId: encounter.providerId,
      organizationId: encounter.organizationId?._id || null,
      organizationName: encounter.organizationId?.email || null,
      organizationFullName: encounter.organizationId?.fullName || null,
      encounterType: encounter.encounterType,
      scheduledAt: encounter.scheduledAt || null,
      startedAt: encounter.startedAt || null,
      endedAt: encounter.endedAt || null,
      reasonForVisit: encounter.reasonForVisit || null,
      chiefComplaint: encounter.chiefComplaint || null,
      priority: encounter.priority || null,
      source: encounter.source || null,
      status: encounter.status || null,
      visibilityToPatient: encounter.visibilityToPatient,
      patientAccess: encounter.patientAccess || null,
      recordStatus: encounter.recordStatus || null,
      notes: encounter.notes || null,
      createdAt: encounter.createdAt,
      updatedAt: encounter.updatedAt,
    },
    records: {
      vitals,
      diagnoses,
      medications,
      labResults,
      procedures,
      allergies,
      immunizations,
      files: [],
    },
  };
};

export const getEncounterDisplayTitle = (encounter) => {
  const typeLabel =
    encounter.encounterType?.charAt(0).toUpperCase() +
      encounter.encounterType?.slice(1) || "Encounter";

  if (encounter.reasonForVisit?.trim()) {
    return `${typeLabel} — ${encounter.reasonForVisit.trim()}`;
  }

  if (encounter.startedAt) {
    return `${typeLabel} — ${new Date(
      encounter.startedAt,
    ).toLocaleDateString()}`;
  }

  return typeLabel;
};
