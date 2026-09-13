import { Encounter } from "./encounter_model.js";
import { resolveTemplatedMessage } from "../notifications/notification_services.js";
import { DeliveryLog } from "../notifications/delivery_log_model.js";
import { sendSms } from "../../shared/utils/termii.js";

// ── Follow-up reminder cadence: day 1, day 7, day 30 after followUpDate. ──
// Matches the polling-sweep pattern in appointment_notifications.js —
// a 24h poll is enough here since these are day-granularity, not
// minute-granularity like appointment reminders.
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

const STAGES = [
  { key: "day1_sent", afterDays: 1, templateName: "Follow-up Info" },
  { key: "day7_sent", afterDays: 7, templateName: "Follow-up Due" },
  { key: "day30_sent", afterDays: 30, templateName: "Follow-up Schedule Prompt" },
];

const sendStageReminder = async (encounter, stage) => {
  const patient = encounter.patientId;
  const orgName = encounter.organizationId?.organizationName || "your facility";
  const link = `/patient/encounters/${encounter._id}`;

  if (!patient?.phone) {
    await DeliveryLog.create({
      channel: "sms",
      status: "skipped",
      recipient: "unknown",
      context: `followup_${stage.key}`,
      errorMessage: "No phone on file for patient",
    });
    await Encounter.updateOne(
      { _id: encounter._id },
      { $set: { followUpReminderStage: stage.key } },
    );
    return;
  }

  const resolved = await resolveTemplatedMessage({
    name: stage.templateName,
    channel: "sms",
    variables: { org_name: orgName, link },
  });

  if (!resolved.send) {
    await DeliveryLog.create({
      channel: "sms",
      status: "skipped",
      recipient: patient.phone,
      context: `followup_${stage.key}`,
      errorMessage: `Not sent: ${resolved.reason}`,
    });
    await Encounter.updateOne(
      { _id: encounter._id },
      { $set: { followUpReminderStage: stage.key } },
    );
    return;
  }

  try {
    await sendSms({ phoneNumber: patient.phone, message: resolved.body });
    await DeliveryLog.create({
      channel: "sms",
      status: "sent",
      recipient: patient.phone,
      context: `followup_${stage.key}`,
    });
  } catch (err) {
    await DeliveryLog.create({
      channel: "sms",
      status: "failed",
      recipient: patient.phone,
      context: `followup_${stage.key}`,
      errorMessage: err?.message || "Unknown error",
    });
    console.error(`Follow-up SMS (${stage.key}) failed for encounter ${encounter._id}:`, err);
  }

  // Marked sent regardless of SMS success — matches appointment
  // reminders' logic; a failed send is logged above for visibility
  // but this stage isn't retried.
  await Encounter.updateOne(
    { _id: encounter._id },
    { $set: { followUpReminderStage: stage.key } },
  );
};

export const runFollowUpReminderSweep = async () => {
  const now = Date.now();
  let checked = 0;

  for (const stage of STAGES) {
    const cutoff = new Date(now - stage.afterDays * 24 * 60 * 60 * 1000);

    // Only encounters whose stage hasn't reached this one yet —
    // STAGES is ordered, so this stage's key being unset means every
    // earlier stage (if any) already fired or this is day 1.
    const priorStageKeys = STAGES
      .slice(0, STAGES.indexOf(stage))
      .map((s) => s.key);
    const notYetAtThisStage = ["none", ...priorStageKeys].filter(
      (k) => k !== stage.key,
    );

    const dueEncounters = await Encounter.find({
      followUpRecommended: true,
      followUpDate: { $lte: cutoff },
      followUpReminderStage: { $in: notYetAtThisStage },
    })
      .populate({ path: "patientId", select: "fullName phone" })
      .populate({ path: "organizationId", select: "organizationName" })
      .lean();

    checked += dueEncounters.length;

    for (const encounter of dueEncounters) {
      await sendStageReminder(encounter, stage);
    }
  }

  return { checked };
};

export const startFollowUpReminderScheduler = () => {
  setInterval(() => {
    runFollowUpReminderSweep().catch((err) =>
      console.error("Follow-up reminder sweep failed:", err),
    );
  }, POLL_INTERVAL_MS);
};
