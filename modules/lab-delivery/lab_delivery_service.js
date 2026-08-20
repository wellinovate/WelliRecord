import cloudinary from "../../shared/config/cloudinary.js";
import { IMAGE_MIME_TYPES } from "../../shared/middlewares/upload.js";
import crypto from "crypto";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { LocalCustomer } from "../local-customers/local_customer_model.js";
import { createLabResultService } from "../lab/lab_result_service.js";
import {
  createNotification,
  sendCriticalAlertSmsService,
  resolveTemplatedMessage,
} from "../notifications/notification_services.js";
import { DeliveryLog } from "../notifications/delivery_log_model.js";
import { sendSms, normalizeNigerianPhone } from "../../shared/utils/termii.js";
import { sendLabResultReadyEmail } from "../../shared/utils/resend.js";

const VAULT_LINK = "https://wellirecord.com/vault";

// Map the free-text panic flag used in the delivery UI onto the
// labResultModel interpretation enum. "critical" is a real clinical
// state distinct from "abnormal" — see lab_model.js enum update.
const FLAG_TO_INTERPRETATION = {
  normal: "normal",
  low: "low",
  high: "high",
  abnormal: "abnormal",
  critical: "critical",
};

async function getOrganizationForActor(authUser) {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found for this account");
    err.statusCode = 404;
    throw err;
  }
  return organization;
}

// ─── Step 1: Dual-factor patient identity verification ───────────────────────
export const verifyPatientIdentityService = async ({ wrId, phone, email }) => {
  const trimmedWrId = (wrId || "").trim();
  if (!trimmedWrId) {
    const err = new Error("WelliRecord ID is required");
    err.statusCode = 400;
    throw err;
  }
  if (!phone && !email) {
    const err = new Error("A phone number or email is required as the second factor");
    err.statusCode = 400;
    throw err;
  }

  const profile = await UserProfile.findOne({ wrId: trimmedWrId }).populate(
    "accountId",
    "email phone",
  );

  if (!profile || !profile.accountId) {
    const err = new Error("No patient found with that WelliRecord ID");
    err.statusCode = 404;
    err.code = "PATIENT_NOT_FOUND";
    throw err;
  }

  const account = profile.accountId;

  const phoneMatches =
    phone && account.phone
      ? normalizeNigerianPhone(phone) === normalizeNigerianPhone(account.phone)
      : false;

  const emailMatches =
    email && account.email
      ? email.trim().toLowerCase() === account.email.trim().toLowerCase()
      : false;

  if (!phoneMatches && !emailMatches) {
    const err = new Error(
      "The phone or email provided does not match this WelliRecord ID",
    );
    err.statusCode = 401;
    err.code = "SECOND_FACTOR_MISMATCH";
    throw err;
  }

  return {
    id: profile._id,
    wrId: profile.wrId,
    name: profile.fullName,
    gender: profile.gender || null,
    dob: profile.dateOfBirth || null,
    avatarUrl: profile.avatar || null,
    phone: account.phone || null,
    email: account.email || null,
  };
};

// ─── Report extraction: honest placeholder, no OCR engine wired up yet ───────
// There is no document AI / OCR integration on the backend. Rather than
// fabricate structured observation data, this returns an explicit
// "not available" result so the frontend can fall back to manual entry.
export const extractReportDataService = async ({ fileName }) => {
  return {
    supported: false,
    extractedObservations: [],
    message:
      "Automatic report extraction is not available yet. Enter observation rows manually below.",
    fileName: fileName || null,
  };
};

// ─── Unregistered patient: create a LocalCustomer record and a real invite ──
export const inviteUnregisteredPatientService = async ({
  fullName,
  phone,
  email,
  authUser,
}) => {
  if (!fullName || !fullName.trim()) {
    const err = new Error("Patient name is required to send an invitation");
    err.statusCode = 400;
    throw err;
  }
  if (!phone && !email) {
    const err = new Error("A phone number or email is required to send an invitation");
    err.statusCode = 400;
    throw err;
  }

  const organization = await getOrganizationForActor(authUser);

  let customer = await LocalCustomer.findOne({
    organizationId: organization._id,
    $or: [
      phone ? { phone: phone.trim() } : null,
      email ? { email: email.trim().toLowerCase() } : null,
    ].filter(Boolean),
  });

  if (!customer) {
    customer = await LocalCustomer.create({
      organizationId: organization._id,
      fullName: fullName.trim(),
      phone: phone ? phone.trim() : null,
      email: email ? email.trim().toLowerCase() : null,
      matchStatus: "new",
      invitationStatus: "not_sent",
    });
  }

  if (customer.invitationStatus === "linked" && customer.welliRecordUserId) {
    const err = new Error(
      "This patient already has a linked WelliRecord account. Use identity verification instead.",
    );
    err.statusCode = 409;
    err.code = "ALREADY_LINKED";
    throw err;
  }

  const token = crypto.randomBytes(12).toString("hex");
  customer.invitationToken = token;
  customer.invitationStatus = "sent";
  customer.invitationSentAt = new Date();
  customer.invitationExpiresAt = new Date(Date.now() + 30 * 86400000);
  await customer.save();

  const inviteUrl = `/join/${token}`;

  // Best-effort SMS dispatch of the invite. Failure here shouldn't block
  // the provider from continuing — the link is still returned to copy.
  let smsDispatched = false;
  if (customer.phone) {
    try {
      await sendSms({
        phoneNumber: customer.phone,
        message: `${organization.organizationName || "Your healthcare provider"} has a laboratory result for you on WelliRecord. Complete your free account to view it: ${inviteUrl}`,
      });
      smsDispatched = true;
    } catch (e) {
      console.error("[inviteUnregisteredPatientService] SMS dispatch failed:", e.message);
    }
  }

  return {
    localCustomerId: customer._id,
    inviteUrl,
    token,
    smsDispatched,
  };
};

// ─── Step 4: Release verified results and dispatch notifications ────────────
export const releaseLabDeliveryService = async ({ payload, files = [], authUser }) => {
  const {
    patientId,
    reportMetadata = {},
    extractedObservations = [],
    notificationChannels = {},
    isCritical = false,
  } = payload;

  if (!patientId) {
    const err = new Error("A verified patient is required before releasing results");
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(extractedObservations) || extractedObservations.length === 0) {
    const err = new Error("At least one result observation row is required");
    err.statusCode = 400;
    throw err;
  }

  // Upload attached report files to Cloudinary if present
  const attachments = [];
  if (Array.isArray(files) && files.length > 0) {
    for (const file of files) {
      try {
        // Was resource_type: "auto" — for a PDF, Cloudinary's
        // auto-detection classifies it under "image" delivery (visible
        // in the resulting URL: /image/upload/...), and Cloudinary
        // blocks unauthenticated delivery of PDF/ZIP files uploaded
        // that way by default, as a security measure. That's exactly
        // what the 401 on "View Document" was — confirmed by checking
        // the failing URL's path directly. "raw" delivery isn't
        // subject to that restriction; same branch radiology_order_
        // service.js already uses correctly for its own non-image
        // (DICOM) uploads.
        const resourceType = IMAGE_MIME_TYPES.includes(file.mimetype) ? "image" : "raw";
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: "lab_reports",
              resource_type: resourceType,
            },
            (err, res) => (err ? reject(err) : resolve(res))
          );
          uploadStream.end(file.buffer);
        });
        attachments.push({
          url: result.secure_url,
          name: file.originalname || "lab_report.pdf",
          fileType: file.mimetype || "application/pdf",
          size: file.size,
          uploadedAt: new Date(),
        });
      } catch (err) {
        console.error("[releaseLabDeliveryService] Cloudinary upload error:", err.message);
      }
    }
  }

  const created = [];
  for (const obs of extractedObservations) {
    if (!obs?.testName) continue;
    const result = await createLabResultService({
      payload: {
        patientId,
        testName: obs.testName,
        category: reportMetadata.category || "other",
        specimen: reportMetadata.specimenType || undefined,
        resultValue: obs.resultValue || undefined,
        unit: obs.unit || undefined,
        referenceRange: obs.referenceRange
          ? { text: obs.referenceRange }
          : undefined,
        interpretation: FLAG_TO_INTERPRETATION[obs.flag] || "unknown",
        collectedAt: reportMetadata.collectionDate || null,
        resultedAt: reportMetadata.resultDate || new Date(),
        verificationStatus: "lab-verified",
        notes: reportMetadata.notes || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        source: "lab",
      },
      authUser,
    });
    created.push(result);
  }

  if (created.length === 0) {
    const err = new Error("No valid observation rows to release — each row needs a test name");
    err.statusCode = 400;
    throw err;
  }

  const profile = await UserProfile.findById(patientId).populate(
    "accountId",
    "email phone",
  );
  const account = profile?.accountId;

  const dispatch = { email: "skipped", sms: "skipped", whatsapp: "skipped", push: "skipped" };

  if (notificationChannels.push && account) {
    try {
      await createNotification({
        recipientAccountId: account._id,
        // Was "lab_result_ready" — the Notification model's type enum
        // only allows "lab_result" (notification_model.js), so every
        // call here threw a Mongoose enum validation error and the
        // push notification never actually got created. Confirmed by
        // constructing a Notification with this exact object and
        // running validateSync() against it — this is the "push:
        // failed" on every release, not a delivery/config issue.
        type: "lab_result",
        title: isCritical ? "Urgent: new lab result available" : "New lab result available",
        body: isCritical
          ? "A critical laboratory result has been added to your WelliRecord."
          : "A laboratory result has been added to your WelliRecord.",
        link: "/vault",
      });
      dispatch.push = "sent";
    } catch (e) {
      console.error("[releaseLabDeliveryService] push notification failed:", e.message);
      dispatch.push = "failed";
    }
  }

  if (notificationChannels.sms && account?.phone) {
    try {
      if (isCritical) {
        const resolved = await resolveTemplatedMessage({
          name: "Critical Lab Alert",
          channel: "sms",
          variables: { link: VAULT_LINK },
          // Patient safety-relevant — a missing (not deactivated)
          // template row shouldn't mean this alert silently never
          // sends, so this keeps a known-good message as a floor.
          safetyNetBody: `Urgent: a critical lab result has been released to your WelliRecord. Log in now: ${VAULT_LINK}`,
        });

        if (resolved.send) {
          await sendCriticalAlertSmsService({
            phoneNumber: account.phone,
            message: resolved.body,
          });
          dispatch.sms = "sent";
        } else {
          await DeliveryLog.create({
            channel: "sms",
            status: "skipped",
            recipient: account.phone,
            context: "critical_lab_alert",
            errorMessage: `Not sent: ${resolved.reason}`,
          });
          dispatch.sms = "skipped";
        }
      } else {
        const resolved = await resolveTemplatedMessage({
          name: "Lab Result Ready",
          channel: "sms",
          variables: { link: VAULT_LINK },
        });

        if (resolved.send) {
          await sendSms({
            phoneNumber: account.phone,
            message: resolved.body,
          });
          dispatch.sms = "sent";
        } else {
          await DeliveryLog.create({
            channel: "sms",
            status: "skipped",
            recipient: account.phone,
            context: "lab_result_ready",
            errorMessage: `Not sent: ${resolved.reason}`,
          });
          dispatch.sms = "skipped";
        }
      }
    } catch (e) {
      console.error("[releaseLabDeliveryService] SMS dispatch failed:", e.message);
      dispatch.sms = "failed";
    }
  }

  if (notificationChannels.email && account?.email) {
    try {
      await sendLabResultReadyEmail({
        email: account.email,
        patientName: profile.fullName,
        isCritical,
      });
      dispatch.email = "sent";
    } catch (e) {
      console.error("[releaseLabDeliveryService] email dispatch failed:", e.message);
      dispatch.email = "failed";
    }
  }

  // WhatsApp delivery has no BSP integration wired up yet — never claim
  // it was sent.
  if (notificationChannels.whatsapp) {
    dispatch.whatsapp = "unavailable";
  }

  return {
    message: `Result released. ${created.length} observation(s) recorded.`,
    resultIds: created.map((r) => r.id),
    dispatch,
  };
};
