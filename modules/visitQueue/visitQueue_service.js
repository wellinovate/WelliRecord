import mongoose from "mongoose";
import { VisitQueue } from "./visitQueue_model.js";
import { Appointment } from "../appointments/appointment_model.js";
import { Encounter } from "../encounter/encounter_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { generateEncounterCode } from "../../shared/utils/helper.js";
import { vitalModel } from "../vitals/vitals_model.js";
import { linkPatientToOrganizationService } from "../organizations/patient/patient_service.js";
import { getMyOrganizationService } from "../organizations/verification_services.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Resolves the acting user's own organisation and confirms the queue
// item actually belongs to it. Every queue item read/write below that
// takes an existing queueId needs this — without it, `protect` alone
// only proves *someone* is logged in, not that they belong to the
// organisation the queue item (and its patient vitals/triage notes)
// belongs to. Throws the same "not found" message either way so a
// cross-org lookup can't be used to enumerate which queue IDs exist
// at other facilities.
const assertQueueItemOwnership = async (queueItem, authUser) => {
  const org = await getMyOrganizationService({
    accountId: authUser?.sub,
    profileId: authUser?.profileId,
  });

  if (String(queueItem.organizationId) !== String(org._id)) {
    throw new Error("Queue item not found");
  }

  return org;
};

export const createWalkInQueueService = async ({
  patientId,
  organizationId,
  departmentId = null,
  assignedDoctorId = null,
  visitType = "walk-in",
  priority = "routine",
  chiefComplaint = "",
  triageNotes = "",
  checkedInBy = null,
  authUser,
}) => {
  if (!isValidObjectId(patientId)) throw new Error("Invalid patientId");
  if (!isValidObjectId(organizationId))
    throw new Error("Invalid organizationId");
  if (departmentId && !isValidObjectId(departmentId))
    throw new Error("Invalid departmentId");
  if (assignedDoctorId && !isValidObjectId(assignedDoctorId))
    throw new Error("Invalid assignedDoctorId");
  if (checkedInBy && !isValidObjectId(checkedInBy))
    throw new Error("Invalid checkedInBy");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const dailyCount = await VisitQueue.countDocuments({
    organizationId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const queueNumber = dailyCount + 1;

  const queueItem = await VisitQueue.create({
    patientId,
    organizationId,
    departmentId,
    assignedDoctorId,
    queueNumber,
    source: "walk-in",
    visitType,
    priority,
    workflowStatus: "waiting",
    chiefComplaint,
    triageNotes,
    checkedInBy,
  });

  try {
    await linkPatientToOrganizationService({
      authUser,
      payload: {
        patientId,
        relationshipType: "provider",
        notes: "Auto-linked via visit queue walk-in check-in",
      },
    });
  } catch (error) {
    console.error("Auto linking failed during walk-in check-in:", error);
  }

  return queueItem;
};

export const getQueueService = async ({ authUser, params }) => {
  const {
    departmentId,
    assignedDoctorId,
    workflowStatus,
    priority,
    visitType,
    page = 1,
    limit = 20,
    search,
  } = params;

  const { actor } = await resolvePatientAccessContext({
    authUser,
  });

  const organizationId = actor.organizationId;

  if (!organizationId) {
    throw new Error("Valid organization is required");
  }

  const query = { organizationId };

  if (departmentId && isValidObjectId(departmentId)) {
    query.departmentId = departmentId;
  }

  if (assignedDoctorId && isValidObjectId(assignedDoctorId)) {
    query.assignedDoctorId = assignedDoctorId;
  }

  if (workflowStatus) {
    query.workflowStatus = workflowStatus;
  }

  if (priority) {
    query.priority = priority;
  }

  if (visitType) {
    query.visitType = visitType;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total, waitingCount, inProgressCount, triagedCount] =
    await Promise.all([
      VisitQueue.find(query)
        .populate("patientId", "fullName email phone gender dateOfBirth wrId")
        .populate("assignedDoctorId", "fullName email")
        .populate("departmentId", "name")
        .populate("encounterId", "encounterCode status startedAt")
        .populate("appointmentId", "appointmentDate appointmentTime type")
        .sort({ priority: -1, queueNumber: 1, createdAt: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),

      VisitQueue.countDocuments(query),

      VisitQueue.countDocuments({
        organizationId,
        workflowStatus: "waiting",
      }),

      VisitQueue.countDocuments({
        organizationId,
        workflowStatus: "in-progress",
      }),

      VisitQueue.countDocuments({
        organizationId,
        workflowStatus: "triaged",
      }),
    ]);

  return {
    items,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
    stats: {
      waiting: waitingCount,
      inProgress: inProgressCount,
      triaged: triagedCount,
    },
  };
};

export const getQueueByIdService = async (queueId, authUser) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");

  const queueItem = await VisitQueue.findById(queueId)
    .populate("patientId", "fullName email phone gender dateOfBirth wrId")
    .populate("assignedDoctorId", "fullName email")
    .populate("departmentId", "name")
    .populate("encounterId")
    .populate("appointmentId")
    .populate("vitalId")
    .lean();

  if (!queueItem) throw new Error("Queue item not found");

  await assertQueueItemOwnership(queueItem, authUser);

  return queueItem;
};

export const updateQueueStatusService = async ({
  queueId,
  workflowStatus,
  actorId = null,
  authUser,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");

  const allowedStatuses = [
    "waiting",
    "triaged",
    "in-consultation",
    "in-progress",
    "completed",
    "cancelled",
    "no-show",
  ];

  if (!allowedStatuses.includes(workflowStatus)) {
    throw new Error("Invalid workflowStatus");
  }

  const queueItem = await VisitQueue.findById(queueId);
  if (!queueItem) throw new Error("Queue item not found");

  await assertQueueItemOwnership(queueItem, authUser);

  if (queueItem.workflowStatus === "completed") {
    throw new Error("Completed queue item cannot be updated");
  }

  queueItem.workflowStatus = workflowStatus;

  if (workflowStatus === "completed") {
    queueItem.completedAt = new Date();
    queueItem.completedBy = actorId;
  }

  if (workflowStatus === "in-progress" && !queueItem.startedAt) {
    queueItem.startedAt = new Date();
    queueItem.startedBy = actorId;
  }

  await queueItem.save();
  return queueItem;
};

export const saveTriageService = async ({
  queueId,
  chiefComplaint,
  triageNotes,
  priority,
  vitals = {},
  triagedBy = null,
  authUser,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");
  if (triagedBy && !isValidObjectId(triagedBy))
    throw new Error("Invalid triagedBy");

  const queueItem = await VisitQueue.findById(queueId);
  if (!queueItem) throw new Error("Queue item not found");

  await assertQueueItemOwnership(queueItem, authUser);

  if (
    ["completed", "cancelled", "no-show"].includes(queueItem.workflowStatus)
  ) {
    throw new Error("Cannot triage an inactive queue item");
  }

  if (chiefComplaint !== undefined) queueItem.chiefComplaint = chiefComplaint;
  if (triageNotes !== undefined) queueItem.triageNotes = triageNotes;
  if (priority !== undefined) queueItem.priority = priority;

  queueItem.vitals = {
    ...queueItem.vitals,
    ...vitals,
  };

  queueItem.triagedAt = new Date();
  queueItem.triagedBy = triagedBy;

  if (queueItem.workflowStatus === "waiting") {
    queueItem.workflowStatus = "triaged";
  }

  await queueItem.save();
  return queueItem;
};

export const startEncounterFromQueueService = async ({
  queueId,
  authUser,
  startedBy = null,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");
  const queueItem = await VisitQueue.findById(queueId);
  if (!queueItem) throw new Error("Queue item not found");

  const { actor, patientId } = await resolvePatientAccessContext({
    patientId: queueItem.patientId,
    authUser,
  });

  const organizationId = actor.organizationId;

  if (!organizationId) {
    throw new Error("Valid organization is required");
  }

  // resolvePatientAccessContext resolves the acting user's own
  // organisation — it doesn't check that organisation is the one this
  // queue item actually belongs to. Without this, any authenticated
  // provider at any facility could start an encounter (and thereby
  // write vitals, own the patient chart entry, etc.) against another
  // facility's queue item.
  if (String(queueItem.organizationId) !== String(organizationId)) {
    throw new Error("Queue item not found");
  }

  if (queueItem.encounterId) {
    throw new Error("Encounter already exists for this queue item");
  }

  if (
    ["completed", "cancelled", "no-show"].includes(queueItem.workflowStatus)
  ) {
    throw new Error("Cannot start encounter for this queue item");
  }

  const encounterCode = await generateEncounterCode(Encounter);

  // Creating the encounter, updating the queue item, and writing the
  // triage vitals across as a real Encounter/Vital record are three
  // writes that should all succeed or all fail together — a partial
  // write here would leave an Encounter with no vitals, or a queue
  // item pointing at an encounter that never got its vitals recorded.
  // A session was already being passed to vitalModel.create below
  // (`{ session }`) but the session itself was never opened, so this
  // whole function threw a ReferenceError on every call — "Start
  // Encounter" from the queue was broken outright.
  const session = await mongoose.startSession();

  try {
    let encounter;
    let vital;

    await session.withTransaction(async () => {
      const created = await Encounter.create(
        [
          {
            patientId: patientId,
            providerId: organizationId,
            organizationId: organizationId,
            queueId: queueItem._id,
            appointmentId: queueItem.appointmentId || null,
            visitSource: queueItem.source,
            encounterTitle: "Outpatient Consultation",
            encounterType:
              queueItem.visitType === "emergency" ? "emergency" : "outpatient",
            encounterCode: encounterCode,
            startedAt: new Date(),
            reasonForVisit: queueItem.chiefComplaint || null,
            chiefComplaint: queueItem.chiefComplaint || null,
            priority:
              queueItem.priority === "emergency"
                ? "critical"
                : queueItem.priority === "urgent"
                ? "urgent"
                : "routine",
            status: "in-progress",
            source: "provider",
            notes: queueItem.triageNotes || null,
          },
        ],
        { session },
      );
      encounter = created[0];

      queueItem.encounterId = encounter._id;
      queueItem.providerId = organizationId;
      queueItem.workflowStatus = "in-progress";
      queueItem.startedAt = new Date();
      queueItem.startedBy = startedBy || organizationId;
      await queueItem.save({ session });

      const createdVitals = await vitalModel.create(
        [
          {
            patientId: patientId,
            recordedBy: organizationId,
            providerId: organizationId,
            organizationId,
            encounterId: encounter._id,
            source: "provider",
            patientVisible: true,

            bloodPressure: queueItem.vitals?.bloodPressure,
            heartRate: queueItem.vitals?.pulse,
            temperature: queueItem.vitals?.temperature,
            // BUGFIX: was queueItem.respiratoryRate — that field only
            // exists nested under queueItem.vitals (see
            // saveTriageService), so this always wrote undefined and
            // silently dropped whatever respiratory rate the nurse
            // recorded at triage.
            respiratoryRate: queueItem.vitals?.respiratoryRate,
            oxygenSaturation: queueItem.vitals?.spo2,
            weight: queueItem.vitals?.weight,
            height: queueItem.vitals?.height,
            measuredAt: queueItem.createdAt || new Date(),
            notes: queueItem.triageNotes || queueItem.chiefComplaint,
          },
        ],
        { session },
      );
      vital = createdVitals[0];

      if (queueItem.appointmentId) {
        await Appointment.findByIdAndUpdate(
          queueItem.appointmentId,
          { status: "checked-in", organizationId },
          { session },
        );
      }
    });

    return { queueItem, encounter, vital };
  } finally {
    await session.endSession();
  }
};

export const completeQueueVisitService = async ({
  queueId,
  completedBy = null,
  authUser,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");

  const queueItem = await VisitQueue.findById(queueId);
  if (!queueItem) throw new Error("Queue item not found");

  await assertQueueItemOwnership(queueItem, authUser);

  if (!queueItem.encounterId) {
    throw new Error("Cannot complete visit without linked encounter");
  }

  const encounter = await Encounter.findById(queueItem.encounterId);
  if (!encounter) {
    throw new Error("Linked encounter not found");
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      queueItem.workflowStatus = "completed";
      queueItem.completedAt = new Date();
      queueItem.completedBy = completedBy || null;

      encounter.status = "completed";
      encounter.endedAt = new Date();

      await Promise.all([
        queueItem.save({ session }),
        encounter.save({ session }),
      ]);

      if (queueItem.appointmentId) {
        await Appointment.findByIdAndUpdate(
          queueItem.appointmentId,
          { status: "completed", providerId: queueItem.providerId || null },
          { session },
        );
      }
    });

    return { queueItem, encounter };
  } finally {
    await session.endSession();
  }
};
