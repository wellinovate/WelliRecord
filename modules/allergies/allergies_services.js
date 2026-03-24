import mongoose from "mongoose";
import { allergyModel } from "./allergies_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";

export const createAllergyService = async ({ payload, authUser }) => {
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

    const docs = await allergyModel.create(
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

          allergen: payload.allergen,
          allergyType: payload.allergyType,
          reaction: payload.reaction || undefined,
          severity: payload.severity || "unknown",
          clinicalStatus: payload.clinicalStatus || "active",

          onsetDate: payload.onsetDate || null,
          lastReactionDate: payload.lastReactionDate || null,
          resolvedAt: payload.resolvedAt || null,

          confirmed: payload.confirmed ?? false,
          verificationStatus: payload.verificationStatus || "unverified",

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
      allergen: created.allergen,
      allergyType: created.allergyType,
      reaction: created.reaction,
      severity: created.severity,
      clinicalStatus: created.clinicalStatus,
      onsetDate: created.onsetDate,
      lastReactionDate: created.lastReactionDate,
      resolvedAt: created.resolvedAt,
      confirmed: created.confirmed,
      verificationStatus: created.verificationStatus,
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

export const getPatientAllergiesService = async ({
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
  };

  if (actor.isOrganizationActor) {
    filter.organizationId = organizationId;
  }

  const [items, total] = await Promise.all([
    allergyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    allergyModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      allergen: item.allergen,
      allergyType: item.allergyType,
      reaction: item.reaction || null,
      severity: item.severity || null,
      clinicalStatus: item.clinicalStatus || null,
      onsetDate: item.onsetDate || null,
      lastReactionDate: item.lastReactionDate || null,
      resolvedAt: item.resolvedAt || null,
      confirmed: item.confirmed ?? false,
      verificationStatus: item.verificationStatus || null,
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
