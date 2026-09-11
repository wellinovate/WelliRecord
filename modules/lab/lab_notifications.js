// modules/lab/lab_notifications.js
import { labResultModel } from "./lab_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { createNotification, resolveTemplatedMessage, sendCriticalAlertSmsService } from "../notifications/notification_services.js";
import { DeliveryLog } from "../notifications/delivery_log_model.js";

// ── Lab result ready — fired right after a lab result is created.
// Deliberately not awaited by the caller: a slow or failed
// notification shouldn't turn a successful result upload into an
// API error. Matches the pattern in appointment_notifications.js.
export const notifyLabResultReady = async (labResultId) => {
  try {
    const result = await labResultModel
      .findById(labResultId)
      .populate({ path: "patientId", select: "fullName phone accountId" }) // CONFIRM: ref target — see clinical_metadata.js (ref: "UserProfile")
      .lean();

    if (!result || !result.patientId) return;

    const patient = Array.isArray(result.patientId) ? result.patientId[0] : result.patientId;
    const isCritical = result.interpretation === "critical";
    const link = `/patient/records/labs/${result._id}`;

    // In-app notification — always, regardless of urgency
    if (patient.accountId) {
      try {
        await createNotification({
          recipientAccountId: patient.accountId,
          type: isCritical ? "critical_alert" : "lab_result",
          title: isCritical ? "Critical lab result" : "Lab result ready",
          body: isCritical
            ? `A critical result for ${result.testName} has been released to your WelliRecord.`
            : `Your ${result.testName} result is now available in your WelliRecord.`,
          link,
        });
      } catch (err) {
        console.error("Lab result in-app notification failed:", err);
      }
    }

    // SMS — critical uses the existing dedicated service; routine goes
    // through the template system like appointment reminders do.
    if (!patient.phone) {
      await DeliveryLog.create({
        channel: "sms",
        status: "skipped",
        recipient: "unknown",
        context: isCritical ? "critical_lab_alert" : "lab_result_ready",
        errorMessage: "No phone on file for patient",
      });
      return;
    }

    if (isCritical) {
      try {
        await sendCriticalAlertSmsService({
          phoneNumber: patient.phone,
          message: `Urgent: a critical lab result has been released to your WelliRecord. Log in now.`,
        });
      } catch (err) {
        console.error("Critical lab alert SMS failed:", err);
      }
      return;
    }

    const resolved = await resolveTemplatedMessage({
      name: "Lab Result Ready",
      channel: "sms",
      variables: { link },
    });

    if (!resolved.send) {
      await DeliveryLog.create({
        channel: "sms",
        status: "skipped",
        recipient: patient.phone,
        context: "lab_result_ready",
        errorMessage: `Not sent: ${resolved.reason}`,
      });
      return;
    }

    try {
      const { sendSms } = await import("../../shared/utils/termii.js");
      await sendSms({ phoneNumber: patient.phone, message: resolved.body });
      await DeliveryLog.create({ channel: "sms", status: "sent", recipient: patient.phone, context: "lab_result_ready" });
    } catch (err) {
      await DeliveryLog.create({
        channel: "sms",
        status: "failed",
        recipient: patient.phone,
        context: "lab_result_ready",
        errorMessage: err?.message || "Unknown error",
      });
      console.error(`Lab result SMS failed for result ${result._id}:`, err);
    }
  } catch (err) {
    console.error("notifyLabResultReady failed:", err);
  }
};
