import mongoose from "mongoose";
import { Appointment } from "./appointment_model.js";
import { VisitQueue } from "../visitQueue/visitQueue_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const createAppointmentService = async ({
  patientId,
  organizationId,
  providerId = null,
  scheduledFor,
  reasonForVisit = null,
  authUser,
  createdBy = null,
}) => {
  console.log("🚀 ~ createAppointmentService ~ authUser:", authUser)
  if (!patientId || !organizationId || !scheduledFor) {
    throw new Error("patientId, organizationId and scheduledFor are required");
  }

  const { actor, patientId: patientIds , isSelf } = await resolvePatientAccessContext({
      patientId : authUser.sub,
      authUser,
    });

  if (!isValidObjectId(patientIds)) throw new Error("Invalid patientId");
  if (!isValidObjectId(organizationId)) throw new Error("Invalid organizationId");
  if (providerId && !isValidObjectId(providerId)) throw new Error("Invalid providerId");
  if (createdBy && !isValidObjectId(createdBy)) throw new Error("Invalid createdBy");

  const appointment = await Appointment.create({
    patientId: patientIds,
    organizationId,
    providerId,
    scheduledFor,
    reasonForVisit,
    createdBy,
  });

  return appointment;
};

export const getAppointmentsService = async ({
  // organizationId,
  // providerId,
  // patientId,
  // status,
  // page = 1,
  // limit = 20,
  // dateFrom,
  // dateTo,
  authUser
}) => {
  const query = {};

  const organizationId = authUser.organizationId
  
  if (organizationId) query.organizationId = organizationId;

  // if (organizationId) query.organizationId = organizationId;
  // if (providerId) query.providerId = providerId;
  // if (patientId) query.patientId = patientId;
  // if (status) query.status = status;

  // if (dateFrom || dateTo) {
  //   query.scheduledFor = {};
  //   if (dateFrom) query.scheduledFor.$gte = new Date(dateFrom);
  //   if (dateTo) query.scheduledFor.$lte = new Date(dateTo);
  // }

  // const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Appointment.find(query)
      .populate("patientId", "fullName wrId phone")
      .populate("providerId", "fullName email phone")
      .populate({
        path: "organizationId",
        select: "organizationName accountId ",
        populate: {
          path: "accountId",
          select: "email fullName accountType isVerified",
        },
      })
      .sort({ scheduledFor: 1 }),
      // .skip(skip)
      // .limit(Number(limit)),
    Appointment.countDocuments(query),
  ]);
  // console.log("🚀 ~ getAppointmentsService ~ items:", items)

  return {
    items,
    total,
    // page: Number(page),
    // limit: Number(limit),
    // totalPages: Math.ceil(total / Number(limit)),
  };
};

export const getAppointmentByIdService = async (appointmentId) => {
  if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");

  const appointment = await Appointment.findById(appointmentId)
    .populate("patientId", "fullName wrId phone")
    .populate("providerId", "fullName email phone");

  if (!appointment) throw new Error("Appointment not found");

  return appointment;
};

export const updateAppointmentService = async (appointmentId, payload = {}) => {
  if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new Error("Appointment not found");

  if (["completed", "cancelled", "no-show"].includes(appointment.status)) {
    throw new Error(`Cannot update a ${appointment.status} appointment`);
  }

  const allowedFields = ["providerId", "scheduledFor", "reasonForVisit", "status"];

  for (const key of allowedFields) {
    if (payload[key] !== undefined) {
      appointment[key] = payload[key];
    }
  }

  await appointment.save();
  return appointment;
};

export const checkInAppointmentService = async ({ appointmentId, checkedInBy }) => {
  if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");
  if (checkedInBy && !isValidObjectId(checkedInBy)) throw new Error("Invalid checkedInBy");

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new Error("Appointment not found");

  if (appointment.status === "cancelled") {
    throw new Error("Cancelled appointment cannot be checked in");
  }

  if (appointment.status === "completed") {
    throw new Error("Completed appointment cannot be checked in");
  }

  let queueItem = await VisitQueue.findOne({ appointmentId: appointment._id });
  if (queueItem) {
    return { appointment, queueItem, message: "Queue item already exists" };
  }

  appointment.status = "checked-in";
  await appointment.save();

  queueItem = await VisitQueue.create({
    patientId: appointment.patientId,
    organizationId: appointment.organizationId,
    appointmentId: appointment._id,
    providerId: appointment.providerId || null,
    source: "appointment",
    workflowStatus: "checked-in",
    chiefComplaint: appointment.reasonForVisit || null,
    checkedInAt: new Date(),
    checkedInBy: checkedInBy || null,
  });

  return { appointment, queueItem };
};

export const markAppointmentNoShowService = async (appointmentId) => {
  if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new Error("Appointment not found");

  if (appointment.status === "completed") {
    throw new Error("Completed appointment cannot be marked as no-show");
  }

  appointment.status = "no-show";
  await appointment.save();

  const queueItem = await VisitQueue.findOne({ appointmentId: appointment._id });
  if (queueItem && !["completed"].includes(queueItem.workflowStatus)) {
    queueItem.workflowStatus = "no-show";
    await queueItem.save();
  }

  return appointment;
};