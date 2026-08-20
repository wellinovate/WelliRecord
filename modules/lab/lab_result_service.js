import { escapeRegexInput } from "../../shared/utils/escapeRegexInput.js";
import { normalizeLabResultData } from "./lab_normalizer.js";
import mongoose from "mongoose";
import { labResultModel } from "./lab_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { resolvePatientAccessContext, resolveActorContext } from "../vitals/vital_service.js";
import { resolveConsentAccess } from "../access/access_grant_service.js";

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

    const normalized = normalizeLabResultData({
      testName: payload.testName,
      category: payload.category,
      unit: payload.unit,
      specimen: payload.specimen,
    });

    // Deduplication check: check if the exact same active test result already exists for this patient on this date
    const resultedAt = payload.resultedAt ? new Date(payload.resultedAt) : new Date();
    const startOfDay = new Date(resultedAt);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(resultedAt);
    endOfDay.setHours(23, 59, 59, 999);

    const existingDuplicate = await labResultModel.findOne({
      patientId: { $in: Array.isArray(patientIds) ? patientIds : [patientIds] },
      testName: { $regex: new RegExp(`^${escapeRegexInput(normalized.testName)}$`, "i") },
      resultedAt: { $gte: startOfDay, $lte: endOfDay },
      recordStatus: "active",
    });

    if (existingDuplicate) {
      if (!existingDuplicate.attachments?.length && payload.attachments?.length) {
        existingDuplicate.attachments = payload.attachments;
        await existingDuplicate.save();
      }
      await session.abortTransaction();
      session.endSession();
      return {
        id: existingDuplicate._id,
        patientId: existingDuplicate.patientId,
        testName: existingDuplicate.testName,
        category: existingDuplicate.category,
        specimen: existingDuplicate.specimen,
        resultValue: existingDuplicate.resultValue,
        unit: existingDuplicate.unit,
        referenceRange: existingDuplicate.referenceRange,
        interpretation: existingDuplicate.interpretation,
        collectedAt: existingDuplicate.collectedAt,
        resultedAt: existingDuplicate.resultedAt,
        verificationStatus: existingDuplicate.verificationStatus,
        attachments: existingDuplicate.attachments || [],
        notes: existingDuplicate.notes,
        createdAt: existingDuplicate.createdAt,
        updatedAt: existingDuplicate.updatedAt,
      };
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

          testName: normalized.testName,
          category: normalized.category,
          specimen: normalized.specimen || undefined,
          resultValue: payload.resultValue || undefined,
          unit: normalized.unit || undefined,
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
    patientId: resolvedPatientId,
    isSelf,
  } = await resolvePatientAccessContext({
    patientId,
    authUser,
  });
  const skip = (page - 1) * limit;



const access = await resolveConsentAccess({
    actor,
    authUser,
    patientId: resolvedPatientId,
    category: "labs",

    baseFilter: {
      // clinicalStatus: "active",
      recordStatus: "active",
    },
  });

  const [items, total] = await Promise.all([
    labResultModel
      .find(access.filter)
      .sort({ resultedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    labResultModel.countDocuments(access.filter),
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
  // BUGFIX: this previously looked up
  // `OrganizationProfile.findOne({ wrOrgId: authUser?.wrOrgId })`.
  // The JWT never sets a `wrOrgId` claim (see signAccessToken in
  // shared/utils/helper.js), so this always queried with
  // `wrOrgId: undefined` — throwing "Organization not found" and
  // 404ing for every provider, org owner and staff alike. It also
  // never worked for staff even if wrOrgId had been set, since staff
  // aren't the account the organization profile is keyed on.
  // resolveActorContext (already fixed for this same bug in vitals)
  // resolves organizationId correctly for both org owners and staff
  // via OrganizationMembership, so reuse it here instead of
  // re-deriving it from a claim that doesn't exist.
  const { organizationId, isOrganizationActor } = await resolveActorContext(authUser);

  if (!isOrganizationActor || !organizationId) {
    const err = new Error("Organization not found for this account");
    err.statusCode = 404;
    throw err;
  }

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

// Marks a lab result as archived or entered-in-error. This is the only
// place recordStatus can move off "active" through the API — it was
// previously only reachable by editing the database directly, which is
// how a mistaken duplicate result (same draw, wrong unit, typo'd test
// name) stayed visible to a patient as "Verified" for as long as it did.
export const correctLabResultService = async ({
  labResultId,
  recordStatus,
  reason,
  authUser,
}) => {
  const result = await labResultModel.findById(labResultId);

  if (!result) {
    const error = new Error("Lab result not found");
    error.statusCode = 404;
    throw error;
  }

  if (result.recordStatus !== "active") {
    const error = new Error(
      `Lab result is already ${result.recordStatus}, not active`,
    );
    error.statusCode = 409;
    throw error;
  }

  const correctedBy = authUser?.sub || null;
  const correctionNote = `[${new Date().toISOString()}] Marked ${recordStatus} by ${correctedBy || "unknown user"}: ${reason}`;

  result.recordStatus = recordStatus;
  result.notes = result.notes
    ? `${result.notes}\n${correctionNote}`
    : correctionNote;

  await result.save();

  return {
    id: result._id,
    recordStatus: result.recordStatus,
    notes: result.notes,
    updatedAt: result.updatedAt,
  };
};
