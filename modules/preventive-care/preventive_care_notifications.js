import { UserProfile } from "../users/user_profile_model.js";
import { PreventiveCareStatus } from "./preventive_care_status_model.js";
import { PREVENTIVE_CARE_SCHEDULE } from "../../config/preventiveCareSchedule.js";
import { resolveTemplatedMessage } from "../notifications/notification_services.js";
import { DeliveryLog } from "../notifications/delivery_log_model.js";
import { sendSms } from "../../shared/utils/termii.js";

// Daily is enough granularity for month-scale intervals — matches the
// follow-up reminder sweep's cadence choice.
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200; // avoid loading the entire patient table at once

const sendCareReminder = async (patient, item) => {
  const link = `/patient/preventive-care/${item.id}`;

  if (!patient.phone) {
    await DeliveryLog.create({
      channel: "sms",
      status: "skipped",
      recipient: "unknown",
      context: `preventive_care_${item.id}`,
      errorMessage: "No phone on file for patient",
    });
  } else {
    const resolved = await resolveTemplatedMessage({
      name: "Preventive Care Reminder",
      channel: "sms",
      variables: { care_label: item.label, link },
    });

    if (!resolved.send) {
      await DeliveryLog.create({
        channel: "sms",
        status: "skipped",
        recipient: patient.phone,
        context: `preventive_care_${item.id}`,
        errorMessage: `Not sent: ${resolved.reason}`,
      });
    } else {
      try {
        await sendSms({ phoneNumber: patient.phone, message: resolved.body });
        await DeliveryLog.create({
          channel: "sms",
          status: "sent",
          recipient: patient.phone,
          context: `preventive_care_${item.id}`,
        });
      } catch (err) {
        await DeliveryLog.create({
          channel: "sms",
          status: "failed",
          recipient: patient.phone,
          context: `preventive_care_${item.id}`,
          errorMessage: err?.message || "Unknown error",
        });
        console.error(`Preventive care SMS (${item.id}) failed for patient ${patient._id}:`, err);
      }
    }
  }

  await PreventiveCareStatus.updateOne(
    { patientId: patient._id, careItemId: item.id },
    { $set: { lastReminderSentAt: new Date() } },
    { upsert: true },
  );
};

export const runPreventiveCareSweep = async () => {
  let checked = 0;
  let skip = 0;

  for (;;) {
    // Only patients who've opted in — this sweep touches the whole
    // population, unlike the other reminders which are scoped to
    // something the patient already engaged with, so opt-in matters
    // more here.
    const patients = await UserProfile.find({
      "notificationPreferences.preventiveCareReminders": true,
    })
      .select("phone dateOfBirth notificationPreferences")
      .skip(skip)
      .limit(BATCH_SIZE)
      .lean();

    if (patients.length === 0) break;

    for (const patient of patients) {
      for (const item of PREVENTIVE_CARE_SCHEDULE) {
        if (!item.appliesIf(patient)) continue;

        const status = await PreventiveCareStatus.findOne({
          patientId: patient._id,
          careItemId: item.id,
        }).lean();

        const cutoff = new Date(
          Date.now() - item.intervalMonths * 30 * 24 * 60 * 60 * 1000,
        );
        const isDue = !status?.lastReminderSentAt || status.lastReminderSentAt <= cutoff;

        if (isDue) {
          checked += 1;
          await sendCareReminder(patient, item);
        }
      }
    }

    skip += BATCH_SIZE;
  }

  return { checked };
};

export const startPreventiveCareScheduler = () => {
  setInterval(() => {
    runPreventiveCareSweep().catch((err) =>
      console.error("Preventive care sweep failed:", err),
    );
  }, POLL_INTERVAL_MS);
};
