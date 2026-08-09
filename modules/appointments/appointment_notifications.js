import { Appointment } from "./appointment_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { sendAppointmentConfirmationEmail } from "../../shared/utils/resend.js";
import { sendSms } from "../../shared/utils/termii.js";
import { createNotification } from "../notifications/notification_services.js";
import { DeliveryLog } from "../notifications/delivery_log_model.js";

// ── Confirmation — fired right after an appointment is created.
// Deliberately not awaited by the caller: a slow or failed
// notification shouldn't turn a successful booking into an API
// error. Each failure is logged, not thrown. ──
export const notifyAppointmentBooked = async (appointmentId) => {
  try {
    const appointment = await Appointment.findById(appointmentId)
      .populate({ path: "patientId", select: "fullName email phone accountId" })
      .populate({ path: "providerId", select: "fullName" })
      .populate({ path: "organizationId", select: "organizationName" })
      .lean();

    if (!appointment || !appointment.patientId) return;

    const patient = appointment.patientId;
    const orgName = appointment.organizationId?.organizationName;
    const providerName = appointment.providerId?.fullName;

    if (patient.email) {
      try {
        await sendAppointmentConfirmationEmail({
          email: patient.email,
          patientName: patient.fullName,
          organizationName: orgName,
          providerName,
          scheduledFor: appointment.scheduledFor,
        });
      } catch (err) {
        console.error("Appointment confirmation email failed:", err);
      }
    }

    if (patient.accountId) {
      try {
        await createNotification({
          recipientAccountId: patient.accountId,
          type: "appointment",
          title: "Appointment confirmed",
          body: `Your appointment at ${orgName || "your facility"}${providerName ? ` with ${providerName}` : ""} is booked for ${new Date(appointment.scheduledFor).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}.`,
        });
      } catch (err) {
        console.error("Appointment in-app notification failed:", err);
      }
    }
  } catch (err) {
    console.error("notifyAppointmentBooked failed:", err);
  }
};

// ── 1-hour reminder scheduler ──
//
// Polls every 5 minutes for booked appointments starting in the next
// 55–65 minute window that haven't been reminded yet. The 10-minute
// window with 5-minute polling means every appointment gets exactly
// one reminder, never zero, never two — a tighter window risks
// missing one between polls; a wider one risks double-sending if a
// poll runs twice near the boundary.
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_START_MIN = 55;
const REMINDER_WINDOW_END_MIN = 65;

const sendReminder = async (appointment) => {
  const patient = appointment.patientId;
  if (!patient?.phone) {
    // Nothing to SMS — mark it sent anyway so this appointment isn't
    // retried forever with no way to ever succeed.
    await Appointment.updateOne(
      { _id: appointment._id },
      { $set: { reminderSentAt: new Date() } },
    );
    return;
  }

  const orgName = appointment.organizationId?.organizationName || "your facility";
  const timeStr = new Date(appointment.scheduledFor).toLocaleString("en-NG", {
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
  const message = `Reminder: you have an appointment at ${orgName} today at ${timeStr}. Reply if you need to reschedule.`;

  try {
    await sendSms({ phoneNumber: patient.phone, message });
    await DeliveryLog.create({
      channel: "sms",
      status: "sent",
      recipient: patient.phone,
      context: "appointment_reminder",
    });
  } catch (err) {
    await DeliveryLog.create({
      channel: "sms",
      status: "failed",
      recipient: patient.phone,
      context: "appointment_reminder",
      errorMessage: err?.message || "Unknown error",
    });
    console.error(`Reminder SMS failed for appointment ${appointment._id}:`, err);
  }

  // Marked sent regardless of SMS success — a failed send gets logged
  // above for visibility, but isn't retried indefinitely; the polling
  // window has already passed by the time this runs again.
  await Appointment.updateOne(
    { _id: appointment._id },
    { $set: { reminderSentAt: new Date() } },
  );
};

export const runAppointmentReminderSweep = async () => {
  const now = Date.now();
  const windowStart = new Date(now + REMINDER_WINDOW_START_MIN * 60 * 1000);
  const windowEnd = new Date(now + REMINDER_WINDOW_END_MIN * 60 * 1000);

  const dueAppointments = await Appointment.find({
    status: "booked",
    reminderSentAt: null,
    scheduledFor: { $gte: windowStart, $lte: windowEnd },
  })
    .populate({ path: "patientId", select: "fullName phone" })
    .populate({ path: "organizationId", select: "organizationName" })
    .lean();

  for (const appointment of dueAppointments) {
    await sendReminder(appointment);
  }

  return { checked: dueAppointments.length };
};

export const startAppointmentReminderScheduler = () => {
  setInterval(() => {
    runAppointmentReminderSweep().catch((err) =>
      console.error("Appointment reminder sweep failed:", err),
    );
  }, POLL_INTERVAL_MS);
};
