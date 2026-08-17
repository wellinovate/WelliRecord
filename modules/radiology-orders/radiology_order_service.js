import mongoose from "mongoose";
import { radiologyOrderModel } from "./radiology_order_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { getIO } from "../../shared/realtime/socket.js";
import cloudinary from "../../shared/config/cloudinary.js";
import { createNotification } from "../notifications/notification_services.js";
import { sendRadiologyReportReadyEmail } from "../../shared/utils/resend.js";

const broadcast = (operationType, order) => {
  const io = getIO();
  if (!io) return;
  io.to(`org:${order.organizationId}`).emit("radiology_order_change", {
    operationType,
    documentId: order.id,
    document: order,
  });
};

const serializeOrder = (item) => ({
  id: item._id,
  patientId: item.patientId,
  organizationId: item.organizationId,
  examName: item.examName,
  modality: item.modality,
  bodyPart: item.bodyPart,
  status: item.status,
  priority: item.priority,
  clinicalIndication: item.clinicalIndication,
  doctorName: item.doctorName,
  doctorPhone: item.doctorPhone,
  price: item.price,
  paymentStatus: item.paymentStatus,
  isCritical: item.isCritical,
  images: (item.images || []).map((img) => ({
    id: img._id,
    url: img.url,
    resourceType: img.resourceType,
    originalFilename: img.originalFilename,
    format: img.format,
    bytes: img.bytes,
    uploadedAt: img.uploadedAt,
  })),
  report: item.report
    ? {
        findings: item.report.findings,
        impression: item.report.impression,
        radiologistName: item.report.radiologistName,
        reportedAt: item.report.reportedAt,
      }
    : null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const createRadiologyOrderService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { actor, patientId } = await resolvePatientAccessContext({
      patientId: payload.patientId,
      authUser,
    });

    const recordedBy = actor.isOrganizationActor
      ? actor.organizationId
      : authUser?.sub || null;

    if (!recordedBy) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

    const organizationId = actor.isOrganizationActor ? actor.organizationId : null;

    const docs = await radiologyOrderModel.create(
      [
        {
          patientId,
          recordedBy,
          providerId: recordedBy,
          organizationId,
          encounterId: payload.encounterId || null,

          source: payload.source || "provider",
          createdContext: "facility-chart",

          examName: payload.examName,
          modality: payload.modality || "other",
          bodyPart: payload.bodyPart || undefined,
          priority: payload.priority || "routine",
          clinicalIndication: payload.clinicalIndication || undefined,
          doctorName: payload.doctorName || undefined,
          doctorPhone: payload.doctorPhone || undefined,
          price: payload.price || 0,
          paymentStatus: payload.paymentStatus || "pending",
          notes: payload.notes || undefined,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    const order = serializeOrder(docs[0]);
    broadcast("insert", order);
    return order;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const getAllRadiologyOrdersService = async ({ page = 1, limit = 20, authUser }) => {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found for this account");
    err.statusCode = 404;
    throw err;
  }

  const skip = (page - 1) * limit;
  const filter = { organizationId: organization._id, recordStatus: "active" };

  const [items, total] = await Promise.all([
    radiologyOrderModel
      .find(filter)
      .populate("patientId", "firstName fullName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    radiologyOrderModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeOrder),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const updateRadiologyOrderStatusService = async ({ id, status }) => {
  const order = await radiologyOrderModel.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (!order) {
    const err = new Error("Radiology order not found");
    err.statusCode = 404;
    throw err;
  }

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const DICOM_MIME_TYPES = ["application/dicom", "application/octet-stream"];
const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — scan exports run larger than avatar photos

// Accepts either a standard exported image (gets a real, viewable
// Cloudinary "image" upload) or a raw DICOM file (gets stored as a
// Cloudinary "raw" upload — retrievable and downloadable, but there is
// no in-browser DICOM viewer wired up yet; that's a separate piece of
// work, not something this endpoint pretends to solve).
export const uploadRadiologyImageService = async ({ id, file, authUser }) => {
  if (!file) {
    const error = new Error("No file was uploaded");
    error.statusCode = 400;
    throw error;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const error = new Error("File must be under 25MB");
    error.statusCode = 400;
    throw error;
  }

  const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);
  const isDicomByName = /\.dcm$/i.test(file.originalname || "");
  const isDicom = DICOM_MIME_TYPES.includes(file.mimetype) && isDicomByName;

  if (!isImage && !isDicom) {
    const error = new Error(
      "Only JPG, PNG, WEBP images or .dcm DICOM files are accepted",
    );
    error.statusCode = 400;
    throw error;
  }

  const order = await radiologyOrderModel.findById(id);
  if (!order) {
    const err = new Error("Radiology order not found");
    err.statusCode = 404;
    throw err;
  }

  const resourceType = isImage ? "image" : "raw";

  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "wellirecord/radiology-orders",
        resource_type: resourceType,
        public_id: `${id}_${Date.now()}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    uploadStream.end(file.buffer);
  }).catch(() => {
    const error = new Error("Failed to upload file. Please try again.");
    error.statusCode = 502;
    throw error;
  });

  order.images.push({
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    resourceType,
    originalFilename: file.originalname || null,
    format: uploadResult.format || null,
    bytes: uploadResult.bytes || file.size,
    uploadedBy: authUser?.sub || null,
  });

  // Only auto-advance the worklist forward — never regress a status
  // that's already past this point (e.g. a report already published).
  if (["requested", "scheduled", "in-progress"].includes(order.status)) {
    order.status = "images-uploaded";
  }

  await order.save();

  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const publishRadiologyReportService = async ({ id, payload, authUser }) => {
  const order = await radiologyOrderModel.findById(id);
  if (!order) {
    const err = new Error("Radiology order not found");
    err.statusCode = 404;
    throw err;
  }

  if (!payload.findings || !payload.findings.trim()) {
    const err = new Error("Findings are required to publish a report");
    err.statusCode = 400;
    throw err;
  }

  order.report = {
    findings: payload.findings,
    impression: payload.impression || null,
    radiologistName: payload.radiologistName || null,
    reportedBy: authUser?.sub || null,
    reportedAt: new Date(),
  };
  order.status = "reported";
  if (typeof payload.isCritical === "boolean") {
    order.isCritical = payload.isCritical;
  }

  await order.save();

  const serialized = serializeOrder(order);
  broadcast("update", serialized);

  // Best-effort patient notification — mirrors the simpler, non-critical
  // path of lab result delivery (createNotification + email). This does
  // not attempt the fuller SMS/critical-alert/unregistered-patient flow
  // lab-delivery has; a radiology order is always against an already
  // linked WelliRecord patient, so that machinery doesn't apply here.
  try {
    const profile = await UserProfile.findById(order.patientId).populate(
      "accountId",
      "email",
    );
    const account = profile?.accountId;

    if (account) {
      await createNotification({
        recipientAccountId: account._id,
        type: "radiology_report_ready",
        title: order.isCritical
          ? "Urgent: new imaging report available"
          : "New imaging report available",
        body: order.isCritical
          ? "A critical imaging report has been added to your WelliRecord."
          : "An imaging report has been added to your WelliRecord.",
        link: "/vault",
      });
    }

    if (account?.email) {
      await sendRadiologyReportReadyEmail({
        email: account.email,
        patientName: profile.fullName,
        examName: order.examName,
        isCritical: order.isCritical,
      });
    }
  } catch (e) {
    console.error("[publishRadiologyReportService] patient notification failed:", e.message);
  }

  return serialized;
};
