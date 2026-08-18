import mongoose from "mongoose";
import { Appointment } from "./appointment_model.js";
import { VisitQueue } from "../visitQueue/visitQueue_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { notifyAppointmentBooked } from "./appointment_notifications.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const toPositiveInt = (value, fallback, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
};

const buildDateQuery = ({ dateFrom, dateTo }) => {
  if (!dateFrom && !dateTo) return null;

  const range = {};

  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isNaN(from.getTime())) {
      range.$gte = from;
    }
  }

  if (dateTo) {
    const to = new Date(dateTo);
    if (!Number.isNaN(to.getTime())) {
      range.$lte = to;
    }
  }

  return Object.keys(range).length ? range : null;
};

export const createAppointmentService = async ({
  patientId,
  organizationId,
  providerId = null,
  scheduledFor,
  reasonForVisit = null,
  authUser,
  createdBy = null,
}) => {
  if (!patientId || !organizationId || !scheduledFor) {
    throw new Error("patientId, organizationId and scheduledFor are required");
  }

  const { patientId: resolvedPatientId } = await resolvePatientAccessContext({
    patientId: authUser.accountType === "organization" ? patientId : authUser.sub,
    authUser,
  });

  if (!isValidObjectId(resolvedPatientId)) {
    throw new Error("Invalid patientId");
  }

  if (!isValidObjectId(organizationId)) {
    throw new Error("Invalid organizationId");
  }

  if (providerId && !isValidObjectId(providerId)) {
    throw new Error("Invalid providerId");
  }

  if (createdBy && !isValidObjectId(createdBy)) {
    throw new Error("Invalid createdBy");
  }

  const appointment = await Appointment.create({
    patientId: resolvedPatientId,
    organizationId,
    providerId: providerId || null,
    scheduledFor,
    reasonForVisit,
    createdBy: createdBy || null,
  });

  notifyAppointmentBooked(appointment._id).catch((err) =>
    console.error("notifyAppointmentBooked failed:", err),
  );

  return appointment;
};

export const getAppointmentsService = async ({ authUser, params = {} }) => {
  const {
    providerId,
    patientId,
    status,
    page = 1,
    limit = 20,
    dateFrom,
    dateTo,
  } = params;

  const numericPage = toPositiveInt(page, 1);
  const numericLimit = toPositiveInt(limit, 20, 100);
  const skip = (numericPage - 1) * numericLimit;

  const query = {};

  // 1. Base access control
  if (authUser.accountType === "organization") {
    if (!authUser.organizationId) {
      throw new Error("Organization user is missing organizationId");
    }

    query.organizationId = authUser.organizationId;

    if (patientId) {
      const { patientId: resolvedPatientId } = await resolvePatientAccessContext({
        patientId,
        authUser,
      });

      query.patientId = resolvedPatientId;
    }
  } else {
    const { patientId: resolvedPatientId } = await resolvePatientAccessContext({
      patientId: authUser.sub,
      authUser,
    });

    query.patientId = resolvedPatientId;
  }

  // 2. Optional filters
  if (providerId) {
    if (!isValidObjectId(providerId)) throw new Error("Invalid providerId");
    query.providerId = providerId;
  }

  if (status) {
    query.status = status;
  }

  const scheduledForRange = buildDateQuery({ dateFrom, dateTo });
  if (scheduledForRange) {
    query.scheduledFor = scheduledForRange;
  }

  const appointmentSelect =
    "patientId organizationId providerId scheduledFor reasonForVisit status createdBy createdAt updatedAt";

  const patientSelect = "fullName wrId phone";
  const providerSelect = "fullName email phone";
  const organizationSelect = "organizationName accountId organizationType logo";
  const accountSelect = "email fullName accountType isVerified";

  const [items, total] = await Promise.all([
    Appointment.find(query)
      .select(appointmentSelect)
      .populate({
        path: "patientId",
        select: patientSelect,
        options: { lean: true },
      })
      .populate({
        path: "providerId",
        select: providerSelect,
        options: { lean: true },
      })
      .populate({
        path: "organizationId",
        select: organizationSelect,
        options: { lean: true },
        populate: {
          path: "accountId",
          select: accountSelect,
          options: { lean: true },
        },
      })
      .sort({ scheduledFor: 1, _id: 1 })
      .skip(skip)
      .limit(numericLimit)
      .lean()
      .exec(),

    Appointment.countDocuments(query).exec(),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(total / numericLimit),
  };
};

export const getAppointmentByIdService = async (appointmentId) => {
  if (!isValidObjectId(appointmentId)) {
    throw new Error("Invalid appointmentId");
  }

  const appointment = await Appointment.findById(appointmentId)
    .select(
      "patientId organizationId providerId scheduledFor reasonForVisit status createdBy createdAt updatedAt"
    )
    .populate({
      path: "patientId",
      select: "fullName wrId phone",
      options: { lean: true },
    })
    .populate({
      path: "providerId",
      select: "fullName email phone",
      options: { lean: true },
    })
    .lean()
    .exec();

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  return appointment;
};

export const updateAppointmentService = async (appointmentId, payload = {}) => {
  if (!isValidObjectId(appointmentId)) {
    throw new Error("Invalid appointmentId");
  }

  const existingAppointment = await Appointment.findById(appointmentId)
    .select("_id status")
    .lean()
    .exec();

  if (!existingAppointment) {
    throw new Error("Appointment not found");
  }

  if (["completed", "cancelled", "no-show"].includes(existingAppointment.status)) {
    throw new Error(`Cannot update a ${existingAppointment.status} appointment`);
  }

  const allowedFields = [
    "providerId",
    "scheduledFor",
    "reasonForVisit",
    "status",
  ];

  const update = {};

  for (const key of allowedFields) {
    if (payload[key] !== undefined) {
      update[key] = payload[key];
    }
  }

  if (update.providerId && !isValidObjectId(update.providerId)) {
    throw new Error("Invalid providerId");
  }

  const appointment = await Appointment.findByIdAndUpdate(
    appointmentId,
    { $set: update },
    { new: true, runValidators: true }
  ).exec();

  return appointment;
};

export const checkInAppointmentService = async ({
  appointmentId,
  checkedInBy,
}) => {
  if (!isValidObjectId(appointmentId)) {
    throw new Error("Invalid appointmentId");
  }

  if (checkedInBy && !isValidObjectId(checkedInBy)) {
    throw new Error("Invalid checkedInBy");
  }

  const appointment = await Appointment.findById(appointmentId).exec();

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  if (appointment.status === "cancelled") {
    throw new Error("Cancelled appointment cannot be checked in");
  }

  if (appointment.status === "completed") {
    throw new Error("Completed appointment cannot be checked in");
  }

  let queueItem = await VisitQueue.findOne({
    appointmentId: appointment._id,
  }).exec();

  if (queueItem) {
    return {
      appointment,
      queueItem,
      message: "Queue item already exists",
    };
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

  return {
    appointment,
    queueItem,
  };
};

export const markAppointmentNoShowService = async (appointmentId) => {
  if (!isValidObjectId(appointmentId)) {
    throw new Error("Invalid appointmentId");
  }

  const appointment = await Appointment.findById(appointmentId).exec();

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  if (appointment.status === "completed") {
    throw new Error("Completed appointment cannot be marked as no-show");
  }

  appointment.status = "no-show";
  await appointment.save();

  await VisitQueue.updateOne(
    {
      appointmentId: appointment._id,
      workflowStatus: { $ne: "completed" },
    },
    {
      $set: {
        workflowStatus: "no-show",
      },
    }
  ).exec();

  return appointment;
};










// import mongoose from "mongoose";
// import { Appointment } from "./appointment_model.js";
// import { VisitQueue } from "../visitQueue/visitQueue_model.js";
// import { resolvePatientAccessContext } from "../vitals/vital_service.js";

// const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// export const createAppointmentService = async ({
//   patientId,
//   organizationId,
//   providerId = null,
//   scheduledFor,
//   reasonForVisit = null,
//   authUser,
//   createdBy = null,
// }) => {
//   console.log("🚀 ~ createAppointmentService ~ authUser:", authUser);
//   if (!patientId || !organizationId || !scheduledFor) {
//     throw new Error("patientId, organizationId and scheduledFor are required");
//   }

//   const {
//     actor,
//     patientId: patientIds,
//     isSelf,
//   } = await resolvePatientAccessContext({
//     patientId: authUser.sub,
//     authUser,
//   });

//   if (!isValidObjectId(patientIds)) throw new Error("Invalid patientId");
//   if (!isValidObjectId(organizationId))
//     throw new Error("Invalid organizationId");
//   if (providerId && !isValidObjectId(providerId))
//     throw new Error("Invalid providerId");
//   if (createdBy && !isValidObjectId(createdBy))
//     throw new Error("Invalid createdBy");

//   const appointment = await Appointment.create({
//     patientId: patientIds,
//     organizationId,
//     providerId,
//     scheduledFor,
//     reasonForVisit,
//     createdBy,
//   });

//   return appointment;
// };

// export const getAppointmentsService = async ({ authUser, params }) => {
//   const {
//     providerId,
//     patientId,
//     status,
//     page = 1,
//     limit = 20,
//     dateFrom,
//     dateTo,
//   } = params;

//   const query = {};

//   const numericPage = Number(page) || 1;
//   const numericLimit = Number(limit) || 20;
//   const skip = (numericPage - 1) * numericLimit;

//   // 1. Base access control
//   if (authUser.accountType === "organization") {
//     if (!authUser.organizationId) {
//       throw new Error("Organization user is missing organizationId");
//     }

//     query.organizationId = authUser.organizationId;

//     // org can optionally filter by patient
//     if (patientId) {
//       const { patientId: resolvedPatientId } = await resolvePatientAccessContext({
//         patientId,
//         authUser,
//       });

//       query.patientId = resolvedPatientId;
//     }
//   } else {
//     // individual patient/user can only see their own appointments
//     const { patientId: resolvedPatientId } = await resolvePatientAccessContext({
//       patientId: authUser.sub,
//       authUser,
//     });

//     query.patientId = resolvedPatientId;
//   }

//   // 2. Optional filters
//   if (providerId) query.providerId = providerId;
//   if (status) query.status = status;

//   if (dateFrom || dateTo) {
//     query.scheduledFor = {};
//     if (dateFrom) query.scheduledFor.$gte = new Date(dateFrom);
//     if (dateTo) query.scheduledFor.$lte = new Date(dateTo);
//   }

//   const [items, total] = await Promise.all([
//     Appointment.find(query)
//       .populate("patientId", "fullName wrId phone")
//       .populate("providerId", "fullName email phone")
//       .populate({
//         path: "organizationId",
//         select: "organizationName accountId",
//         populate: {
//           path: "accountId",
//           select: "email fullName accountType isVerified",
//         },
//       })
//       .sort({ scheduledFor: 1 })
//       .skip(skip)
//       .limit(numericLimit),
//     Appointment.countDocuments(query),
//   ]);

//   return {
//     items,
//     total,
//     page: numericPage,
//     limit: numericLimit,
//     totalPages: Math.ceil(total / numericLimit),
//   };
// };

// export const getAppointmentByIdService = async (appointmentId) => {
//   if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");

//   const appointment = await Appointment.findById(appointmentId)
//     .populate("patientId", "fullName wrId phone")
//     .populate("providerId", "fullName email phone");

//   if (!appointment) throw new Error("Appointment not found");

//   return appointment;
// };

// export const updateAppointmentService = async (appointmentId, payload = {}) => {
//   if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");

//   const appointment = await Appointment.findById(appointmentId);
//   if (!appointment) throw new Error("Appointment not found");

//   if (["completed", "cancelled", "no-show"].includes(appointment.status)) {
//     throw new Error(`Cannot update a ${appointment.status} appointment`);
//   }

//   const allowedFields = [
//     "providerId",
//     "scheduledFor",
//     "reasonForVisit",
//     "status",
//   ];

//   for (const key of allowedFields) {
//     if (payload[key] !== undefined) {
//       appointment[key] = payload[key];
//     }
//   }

//   await appointment.save();
//   return appointment;
// };

// export const checkInAppointmentService = async ({
//   appointmentId,
//   checkedInBy,
// }) => {
//   if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");
//   if (checkedInBy && !isValidObjectId(checkedInBy))
//     throw new Error("Invalid checkedInBy");

//   const appointment = await Appointment.findById(appointmentId);
//   if (!appointment) throw new Error("Appointment not found");

//   if (appointment.status === "cancelled") {
//     throw new Error("Cancelled appointment cannot be checked in");
//   }

//   if (appointment.status === "completed") {
//     throw new Error("Completed appointment cannot be checked in");
//   }

//   let queueItem = await VisitQueue.findOne({ appointmentId: appointment._id });
//   if (queueItem) {
//     return { appointment, queueItem, message: "Queue item already exists" };
//   }

//   appointment.status = "checked-in";
//   await appointment.save();

//   queueItem = await VisitQueue.create({
//     patientId: appointment.patientId,
//     organizationId: appointment.organizationId,
//     appointmentId: appointment._id,
//     providerId: appointment.providerId || null,
//     source: "appointment",
//     workflowStatus: "checked-in",
//     chiefComplaint: appointment.reasonForVisit || null,
//     checkedInAt: new Date(),
//     checkedInBy: checkedInBy || null,
//   });

//   return { appointment, queueItem };
// };

// export const markAppointmentNoShowService = async (appointmentId) => {
//   if (!isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId");

//   const appointment = await Appointment.findById(appointmentId);
//   if (!appointment) throw new Error("Appointment not found");

//   if (appointment.status === "completed") {
//     throw new Error("Completed appointment cannot be marked as no-show");
//   }

//   appointment.status = "no-show";
//   await appointment.save();

//   const queueItem = await VisitQueue.findOne({
//     appointmentId: appointment._id,
//   });
//   if (queueItem && !["completed"].includes(queueItem.workflowStatus)) {
//     queueItem.workflowStatus = "no-show";
//     await queueItem.save();
//   }

//   return appointment;
// };


export const getSlotAvailabilityService = async ({
  organizationId,
  providerId = null,
  date,
}) => {
  if (!organizationId || !date) {
    throw new Error("organizationId and date are required");
  }

  const STANDARD_SLOTS = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "14:00",
    "15:00",
    "16:00",
  ];

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const query = {
    organizationId,
    scheduledFor: { $gte: startOfDay, $lte: endOfDay },
    status: { $nin: ["cancelled", "no-show"] },
  };

  if (providerId) {
    query.providerId = providerId;
  }

  const existingAppointments = await Appointment.find(query).select("scheduledFor status").lean();

  const now = new Date();
  const isToday = now.toISOString().slice(0, 10) === date;
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const slotCapacity = providerId ? 1 : 2;

  const slots = STANDARD_SLOTS.map((slot) => {
    const [slotHour, slotMin] = slot.split(":").map(Number);
    const isPast =
      isToday &&
      (slotHour < currentHour || (slotHour === currentHour && currentMinute > 15));

    const bookedCount = existingAppointments.filter((apt) => {
      const aptTime = new Date(apt.scheduledFor);
      return aptTime.getUTCHours() === slotHour && aptTime.getUTCMinutes() === slotMin;
    }).length;

    const isBooked = bookedCount >= slotCapacity;
    const available = !isPast && !isBooked;

    let reason = null;
    if (isPast) reason = "past";
    else if (isBooked) reason = "booked";

    return {
      slot,
      available,
      bookedCount,
      capacity: slotCapacity,
      reason,
    };
  });

  return {
    date,
    organizationId,
    slots,
  };
};
