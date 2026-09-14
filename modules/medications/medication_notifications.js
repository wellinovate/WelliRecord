import { medicationModel } from "./medications_model.js";
import { resolveTemplatedMessage } from "../notifications/notification_services.js";
import { DeliveryLog } from "../notifications/delivery_log_model.js";
import { sendSms } from "../../shared/utils/termii.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MATCH_WINDOW_MIN = 5;

const currentHHMM = () => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const withinWindow = (scheduleTime) => {
  const [sh, sm] = scheduleTime.split(":").map(Number);
  const [nh, nm] = currentHHMM().split(":").map(Number);
  return Math.abs((nh * 60 + nm) - (sh * 60 + sm)) <= MATCH_WINDOW_MIN;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const sendDoseReminder = async (medication, patient, scheduleTime) => {
  const link = `/patient/medications/${medication._id}`;
  const context = `medication_${medication._id}_${scheduleTime}_${todayKey()}`;

  const already = await DeliveryLog.findOne({ context }).lean();
  if (already) return;

  if (!patient?.phone) {
    await DeliveryLog.create({
      channel: "sms",
      status: "skipped",
      recipient: "unknown",
      context,
      errorMessage: "No phone on file for patient",
    });
    return;
  }

  const resolved = await resolveTemplatedMessage({
    name: "Medication Reminder",
    channel: "sms",
    variables: {
      medication_name: medication.medicationName,
      dosage: medication.dosage?.value
        ? `${medication.dosage.value}${medication.dosage.unit || ""}`
        : "",
      link,
    },
  });

  if (!resolved.send) {
    await DeliveryLog.create({
      channel: "sms",
      status: "skipped",
      recipient: patient.phone,
      context,
      errorMessage: `Not sent: ${resolved.reason}`,
    });
    return;
  }

  try {
    await sendSms({ phoneNumber: patient.phone, message: resolved.body });
    await DeliveryLog.create({ channel: "sms", status: "sent", recipient: patient.phone, context });
  } catch (err) {
    await DeliveryLog.create({
      channel: "sms",
      status: "failed",
      recipient: patient.phone,
      context,
      errorMessage: err?.message || "Unknown error",
    });
    console.error(`Medication reminder SMS failed for ${medication._id}:`, err);
  }
};

export const runMedicationReminderSweep = async () => {
  let checked = 0;

  const medications = await medicationModel
    .find({
      medicationStatus: "active",
      reminderEnabled: true,
      scheduleTimes: { $exists: true, $ne: [] },
    })
    .populate({ path: "patientId", select: "phone notificationPreferences" })
    .lean();

  for (const medication of medications) {
    const patient = medication.patientId;
    if (!patient?.notificationPreferences?.medicationReminders) continue;

    for (const scheduleTime of medication.scheduleTimes) {
      if (!withinWindow(scheduleTime)) continue;
      checked += 1;
      await sendDoseReminder(medication, patient, scheduleTime);
    }
  }

  return { checked };
};

export const startMedicationReminderScheduler = () => {
  setInterval(() => {
    runMedicationReminderSweep().catch((err) =>
      console.error("Medication reminder sweep failed:", err),
    );
  }, POLL_INTERVAL_MS);
};
