import mongoose from "mongoose";
import { vitalModel } from "./vitals_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
// import { Patient } from "../patients/patient_model.js"; // adjust path/model name
// import { Encounter } from "../encounters/encounter_model.js"; // optional, if validating encounter existence

export const createVitalService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { actor, patientId, isSelf } = await resolvePatientAccessContext({
      patientId: payload.patientId,
      authUser,
    });
    

    // if (payload) return;
    let recordedBy = null;

    // const organizationIdFromUser = authUser?.sub || null;
    if (actor.isOrganizationActor === true) {
      recordedBy = actor.organizationId;
      console.log("🚀 ~ createVitalService ~ recordedBy:", recordedBy);
    } else {
      recordedBy = authUser?.sub || null;
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

    // if (actor.isOrganizationActor) {
    //   const canCreate = await hasOrganizationCreateAccess({
    //     patientId: payload.patientId,
    //     organizationId: actor.organizationId,
    //   });

    //   if (!canCreate) {
    //     const error = new Error(
    //       "Organization does not have permission to create vitals for this patient",
    //     );
    //     error.statusCode = 403;
    //     throw error;
    //   }
    // }

    const source = actor.isPatientActor
      ? payload.source || "patient"
      : payload.source || "provider";

    const createdContext = actor.isPatientActor
      ? payload.createdContext || "patient-app"
      : payload.createdContext || "provider-chart";

    const providerId = actor.isOrganizationActor ? actor.userId : null;
    const organizationId = actor.isOrganizationActor && actor.organizationId;

    // const check = patientFromUserProfile || patientFromPatientIdentity;
    if (!patientId) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }

    const provider =
      actor.isOrganizationActor === true
        ? payload.providerId || recordedBy
        : null;

    const vital = await vitalModel.create(
      [
        {
          patientId: payload.patientId,
          recordedBy,
          providerId: provider,
          organizationId,
          encounterId: payload.encounterId || null,
          source: source,
          createdContext: createdContext,
          ownershipType: payload.ownershipType || "shared",
          visibility: payload.visibility || "shared",
          patientAccess: payload.patientAccess || "full",
          patientVisible:
            payload.patientVisible !== undefined
              ? payload.patientVisible
              : true,

          bloodPressure: payload.bloodPressure,
          heartRate: payload.heartRate,
          temperature: payload.temperature,
          respiratoryRate: payload.respiratoryRate,
          oxygenSaturation: payload.oxygenSaturation,
          weight: payload.weight,
          height: payload.height,
          bloodGlucose: payload.bloodGlucose,
          measuredAt: payload.measuredAt || new Date(),
          notes: payload.notes || undefined,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    const created = vital[0];

    return {
      id: created._id,
      patientId: created.patientId,
      providerId: created.providerId,
      organizationId: created.organizationId,
      encounterId: created.encounterId,
      source: created.source,
      createdContext: created.createdContext,
      measuredAt: created.measuredAt,
      bloodPressure: created.bloodPressure,
      heartRate: created.heartRate,
      temperature: created.temperature,
      respiratoryRate: created.respiratoryRate,
      oxygenSaturation: created.oxygenSaturation,
      weight: created.weight,
      height: created.height,
      bmi: created.bmi,
      bloodGlucose: created.bloodGlucose,
      notes: created.notes,
      recordStatus: created.recordStatus,
      clinicalStatus: created.clinicalStatus,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const getPatientVitalsService = async ({
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
  const organizationId = actor.isOrganizationActor
    ? authUser?.sub || null
    : null;
  const skip = (page - 1) * limit;

  const filter = {
    patientId: patientIds,
    recordStatus: "active",
    clinicalStatus: "active",
  };

  // if (actor.isPatientActor) {
  //   if (!isSelf) {
  //     const error = new Error("You can only view your own vitals");
  //     error.statusCode = 403;
  //     throw error;
  //   }
  //   // patient sees all own vitals
  // } else if (actor.isOrganizationActor) {
  //   const hasFullAccess = await hasOrganizationFullReadAccess({
  //     patientId: patientIds,
  //     organizationId: organizationId,
  //   });

  //   if (hasFullAccess) {
  //     // org sees all vitals
  //   } else {
  //     // org only sees vitals created by itself
  //     filter.organizationId = actor.organizationId;
  //   }
  // } else {
  //   const error = new Error("Unauthorized actor type");
  //   error.statusCode = 403;
  //   throw error;
  // }

  if (actor.isOrganizationActor) {
    filter.organizationId = organizationId;
  }

  const [vitals, total] = await Promise.all([
    vitalModel
      .find(filter)
      .populate("recordedBy", "organizationName email")
      .sort({ measuredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    vitalModel.countDocuments(filter),
  ]);
  console.log("🚀 ~ getPatientVitalsService ~ vitals:", vitals)

  return {
    items: vitals.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      source: item.source,
      measuredAt: item.measuredAt,
      bloodPressure: item.bloodPressure || null,
      heartRate: item.heartRate ?? null,
      temperature: item.temperature || null,
      respiratoryRate: item.respiratoryRate ?? null,
      oxygenSaturation: item.oxygenSaturation ?? null,
      organiztion: item.organizationId?._id || null,
      organizationEmail: item.organizationId?.email,
      organizationFullName: item.organizationId?.organizationName || null,
      weight: item.weight || null,
      height: item.height || null,
      bmi: item.bmi ?? null,
      bloodGlucose: item.bloodGlucose || null,
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

const resolveActorContext = async (authUser) => {
  const userId = authUser?._id || authUser?.sub || null;
  const accountType =
    authUser?.accountType || authUser?.account?.accountType || null;
  // console.log("🚀 ~ resolveActorContext ~ accountType:", accountType);

  const isOrganizationActor = accountType === "organization";
  // accountType === "provider" ||

  const isPatientActor = accountType === "user" || accountType === "patient";

  let organizationId = null;
  let organizationName = null;

  if (isOrganizationActor) {
    const wrOrgId = authUser?.orgId || null;
    const organization = await OrganizationProfile.findOne({
      wrOrgId: wrOrgId,
    });
    organizationId = organization._id;
    organizationName = organization.organizationName;
  }

  // const organizationId = (isOrganizationActor && authUser?.sub) || null;

  return {
    userId,
    organizationId,
    organizationName,
    accountType,
    isOrganizationActor,
    isPatientActor,
  };
};

export const resolvePatientAccessContext = async ({ patientId, authUser }) => {
  console.log("🚀 ~ resolvePatientAccessContext ~ patientId:", patientId);
  const session = await mongoose.startSession();
  session.startTransaction();

  const actor = await resolveActorContext(authUser);

  if (actor.isOrganizationActor === true) {
    const patientFromPatientIdentity = await PatientIdentity.findById(
      patientId,
    ).session(session);
    if (patientFromPatientIdentity) {
      const isSelf =
        actor.isPatientActor &&
        String(patientId || "") === String(actor.userId || "");

      return {
        actor,
        patientId,
        isSelf,
      };
    } else {
      const patientFromUserProfile = await UserProfile.findById(
        patientId,
      ).session(session);

      if (!patientFromUserProfile) {
        const error = new Error("Patient not found");
        error.statusCode = 404;
        throw error;
      }

      const isSelf =
        actor.isPatientActor &&
        String(patientId || "") === String(actor.userId || "");

      return {
        actor,
        patientId,
        isSelf,
      };
    }
  }

  if (actor.isPatientActor === true) {
    const patientFromUserProfile = await UserProfile.findOne({
      accountId: patientId,
    }).session(session);
    if (patientFromUserProfile) {
      const isSelf =
        actor.isPatientActor &&
        String(patientFromUserProfile.accountId || "") ===
          String(actor.userId || "");

      return {
        actor,
        patientId: patientFromUserProfile._id,
        isSelf,
      };
    }
  }

  const patientFromUserProfile = await UserProfile.findById(patientId).session(
    session,
  );

  if (!patientFromUserProfile) {
    const error = new Error("Patient not found");
    error.statusCode = 404;
    throw error;
  }
  const isSelf =
    actor.isPatientActor &&
    String(patientId || "") === String(actor.userId || "");

  return {
    actor,
    patientId,
    isSelf,
  };

  // Optional: verify patient exists

  // Example: patient-owned account case
  // Adapt this to your actual model relationship.
};

const hasOrganizationFullReadAccess = async ({ patientId, organizationId }) => {
  if (!organizationId) return false;

  // Replace this with your real consent/grant model
  // Example:
  // const grant = await ConsentGrant.findOne({
  //   patientId,
  //   organizationId,
  //   status: "active",
  //   scope: { $in: ["all-records", "vitals"] },
  // }).lean();

  // return Boolean(grant);

  return false;
};

const hasOrganizationCreateAccess = async ({ patientId, organizationId }) => {
  if (!organizationId) return false;

  // Replace with your actual linkage/consent logic.
  // Example:
  // const relation = await PatientOrganization.findOne({
  //   patientId,
  //   organizationId,
  //   status: "active",
  // }).lean();
  // return Boolean(relation);

  return true;
};
