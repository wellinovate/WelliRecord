import mongoose from "mongoose";
import { VisitQueue } from "./visitQueue_model.js";
import { Appointment } from "../appointments/appointment_model.js";
import { Encounter } from "../encounter/encounter_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { generateEncounterCode } from "../../shared/utils/helper.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const createWalkInQueueService = async ({
  patientId,
  organizationId,
  providerId = null,
  visitType = "consultation",
  priority = "normal",
  chiefComplaint = null,
  authUser,
  checkedInBy = null,
}) => {
  const { actor, patientId: patientIds , isSelf } = await resolvePatientAccessContext({
        patientId: patientId,
        authUser,
      });
  console.log("🚀 ~ createWalkInQueueService ~ organizationId:", actor.organizationId)
  console.log("🚀 ~ createWalkInQueueService ~ patientId:", patientId)
  if (!patientIds || !actor.organizationId) {
    throw new Error("patientId and organizationId are required");
  }

  if (!isValidObjectId(patientIds)) throw new Error("Invalid patientId");
  if (!isValidObjectId(actor.organizationId)) throw new Error("Invalid organizationId");
  if (providerId && !isValidObjectId(providerId)) throw new Error("Invalid providerId");
  if (checkedInBy && !isValidObjectId(checkedInBy)) throw new Error("Invalid checkedInBy");

  const queueItem = await VisitQueue.create({
    patientId: patientIds,
    organizationId: actor.organizationId,
    providerId,
    source: "walk-in",
    visitType,
    priority,
    chiefComplaint,
    workflowStatus: "checked-in",
    checkedInAt: new Date(),
    checkedInBy,
  });

  return queueItem;
};

export const getQueueService = async ({
  organizationId,
  providerId,
  workflowStatus,
  source,
  page = 1,
  limit = 20,
}) => {
  const query = {};

  if (organizationId) query.organizationId = organizationId;
  if (providerId) query.providerId = providerId;
  if (workflowStatus) query.workflowStatus = workflowStatus;
  if (source) query.source = source;

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    VisitQueue.find(query)
      .populate("patientId", "fullName wrId phone")
      .populate("providerId", "fullName email")
      .populate("appointmentId", "scheduledFor status reasonForVisit")
      .populate("encounterId", "encounterCode encounterTitle status startedAt endedAt")
      .sort({ checkedInAt: 1, createdAt: 1 })
      .skip(skip)
      .limit(Number(limit)),
    VisitQueue.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

export const getQueueByIdService = async (queueId) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");

  const queueItem = await VisitQueue.findById(queueId)
    .populate("patientId", "fullName wrId phone gender dateOfBirth")
    .populate("providerId", "fullName email phone")
    .populate("appointmentId", "scheduledFor status reasonForVisit")
    .populate("encounterId", "encounterCode encounterTitle status startedAt endedAt chiefComplaint notes");

  if (!queueItem) throw new Error("Queue item not found");

  return queueItem;
};

export const updateQueueStatusService = async ({
  queueId,
  workflowStatus,
  actorId = null,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");

  const allowedStatuses = [
    "checked-in",
    "triage",
    "waiting",
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

  if (queueItem.workflowStatus === "completed") {
    throw new Error("Completed queue item cannot be updated");
  }

  if (queueItem.workflowStatus === "no-show") {
    throw new Error("No-show queue item cannot be updated");
  }

  queueItem.workflowStatus = workflowStatus;

  if (workflowStatus === "triage") {
    queueItem.triagedBy = actorId || queueItem.triagedBy;
  }

  if (workflowStatus === "waiting" && !queueItem.triagedAt) {
    queueItem.triagedAt = new Date();
    queueItem.triagedBy = actorId || queueItem.triagedBy;
  }

  if (workflowStatus === "completed" && !queueItem.completedAt) {
    queueItem.completedAt = new Date();
    queueItem.completedBy = actorId || queueItem.completedBy;
  }

  await queueItem.save();
  return queueItem;
};

export const saveTriageService = async ({
  queueId,
  triageNotes = null,
  chiefComplaint = null,
  priority,
  vitals = {},
  triagedBy = null,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");
  if (triagedBy && !isValidObjectId(triagedBy)) throw new Error("Invalid triagedBy");

  const queueItem = await VisitQueue.findById(queueId);
  if (!queueItem) throw new Error("Queue item not found");

  if (["completed", "cancelled", "no-show"].includes(queueItem.workflowStatus)) {
    throw new Error(`Cannot triage a ${queueItem.workflowStatus} queue item`);
  }

  queueItem.workflowStatus = "waiting";
  queueItem.triagedAt = new Date();
  queueItem.triagedBy = triagedBy;

  if (triageNotes !== undefined) queueItem.triageNotes = triageNotes;
  if (chiefComplaint !== undefined) queueItem.chiefComplaint = chiefComplaint;
  if (priority !== undefined) queueItem.priority = priority;

  queueItem.vitals = {
    temperature: vitals.temperature ?? queueItem.vitals?.temperature ?? null,
    pulse: vitals.pulse ?? queueItem.vitals?.pulse ?? null,
    bloodPressure: vitals.bloodPressure ?? queueItem.vitals?.bloodPressure ?? null,
    respiratoryRate:
      vitals.respiratoryRate ?? queueItem.vitals?.respiratoryRate ?? null,
    spo2: vitals.spo2 ?? queueItem.vitals?.spo2 ?? null,
    weight: vitals.weight ?? queueItem.vitals?.weight ?? null,
    height: vitals.height ?? queueItem.vitals?.height ?? null,
  };

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
  
  const { actor, patientId , isSelf } = await resolvePatientAccessContext({
    patientId : queueItem.patientId,
    authUser,
  });
  console.log("🚀 ~ startEncounterFromQueueService ~ actor:", actor)

  const organizationId = actor.organizationId

  if (!organizationId || !isValidObjectId(organizationId)) {
    throw new Error("Valid organization is required");
  }


  if (queueItem.encounterId) {
    throw new Error("Encounter already exists for this queue item");
  }

  if (!["checked-in", "triage", "waiting"].includes(queueItem.workflowStatus)) {
    throw new Error(`Cannot start encounter from ${queueItem.workflowStatus} status`);
  }

  const encounterCode = await generateEncounterCode(Encounter);

  const encounter = await Encounter.create({
  patientId: patientId,
  providerId: organizationId,
  organizationId: organizationId,
  queueId: queueItem._id,
  appointmentId: queueItem.appointmentId || null,
  visitSource: queueItem.source,
  encounterTitle: "Outpatient Consultation",
  encounterType: queueItem.visitType === "emergency" ? "emergency" : "outpatient",
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
});

  queueItem.encounterId = encounter._id;
  queueItem.providerId = organizationId;
  queueItem.workflowStatus = "in-progress";
  queueItem.startedAt = new Date();
  queueItem.startedBy = startedBy || organizationId;

  await queueItem.save();

  if (queueItem.appointmentId) {
    await Appointment.findByIdAndUpdate(queueItem.appointmentId, {
      status: "checked-in",
      organizationId,
    });
  }

  return { queueItem, encounter };
};

export const completeQueueVisitService = async ({
  queueId,
  completedBy = null,
}) => {
  if (!isValidObjectId(queueId)) throw new Error("Invalid queueId");

  const queueItem = await VisitQueue.findById(queueId);
  if (!queueItem) throw new Error("Queue item not found");

  if (!queueItem.encounterId) {
    throw new Error("Cannot complete visit without linked encounter");
  }

  const encounter = await Encounter.findById(queueItem.encounterId);
  if (!encounter) {
    throw new Error("Linked encounter not found");
  }

  queueItem.workflowStatus = "completed";
  queueItem.completedAt = new Date();
  queueItem.completedBy = completedBy || null;

  encounter.status = "completed";
  encounter.endedAt = new Date();

  await Promise.all([queueItem.save(), encounter.save()]);

  if (queueItem.appointmentId) {
    await Appointment.findByIdAndUpdate(queueItem.appointmentId, {
      status: "completed",
      providerId: queueItem.providerId || null,
    });
  }

  return { queueItem, encounter };
};