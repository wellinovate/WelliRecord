import mongoose from "mongoose";
import { radiologyOrderModel } from "./radiology_order_model.js";
import { resolvePatientAccessContext, resolveActorContext } from "../vitals/vital_service.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { getEffectivePermissions } from "../team/permission_registry.js";
import { canReview, canRelease, canEditNote, reviewerConflict, cleanReview, cleanNote, statusChangeError } from "./radiology_review_rules.js";
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

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// The ids this caller's organisation is stored under. Orders are found only inside them.
const orgScope = async (authUser) => {
  const ids = new Set();
  if (authUser?.wrOrgId) {
    const p = await OrganizationProfile.findOne({ wrOrgId: authUser.wrOrgId }).select("_id accountId").lean();
    if (p) { ids.add(String(p._id)); if (p.accountId) ids.add(String(p.accountId)); }
  }
  try {
    const actor = await resolveActorContext(authUser);
    if (actor?.organizationId) ids.add(String(actor.organizationId));
  } catch { /* no organisation context */ }
  if (!ids.size) throw httpError("Imaging access requires an organisation account", 403);
  return [...ids];
};

// Not found and not yours look the same on purpose.
const findScoped = async (id, authUser) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw httpError("Radiology order not found", 404);
  const ids = await orgScope(authUser);
  const order = await radiologyOrderModel.findOne({ _id: id, organizationId: { $in: ids }, recordStatus: "active" });
  if (!order) throw httpError("Radiology order not found", 404);
  return order;
};

const actorName = async (authUser) => {
  const actor = await resolveActorContext(authUser).catch(() => null);
  return { userId: String(authUser?.sub || actor?.userId || ""), name: actor?.organizationName || "Staff" };
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
  review: item.review?.state ? { state: item.review.state, byName: item.review.byName, at: item.review.at, comment: item.review.comment } : null,
  reviewLog: item.reviewLog || [],
  returnReason: item.returnReason || null,
  patientNote: item.patientNote || null,
  releasedAt: item.releasedAt || null,
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
    viewer: { userId: String(authUser?.sub || ""), canApprove: await callerCanApproveRadiology(authUser) },
  };
};

export const updateRadiologyOrderStatusService = async ({ id, status, authUser }) => {
  const blocked = statusChangeError(status);
  if (blocked) throw httpError(blocked, 409);
  const order = await findScoped(id, authUser);
  order.status = status;
  await order.save();
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

  const order = await findScoped(id, authUser);

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

// Saves the report for senior review. The patient is told only when it is released.
export const publishRadiologyReportService = async ({ id, payload, authUser }) => {
  const order = await findScoped(id, authUser);
  if (order.releasedAt) throw httpError("This report has already been released to the patient.", 409);

  if (!payload.findings || !payload.findings.trim()) throw httpError("Findings are required to publish a report", 400);

  order.report = {
    findings: payload.findings,
    impression: payload.impression || null,
    radiologistName: payload.radiologistName || null,
    reportedBy: authUser?.sub || null,
    reportedAt: new Date(),
  };
  order.status = "reported";
  order.review = undefined;
  order.returnReason = undefined;
  if (typeof payload.isCritical === "boolean") order.isCritical = payload.isCritical;

  await order.save();
  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

// ---------- senior review, patient note, release ----------
export const callerCanApproveRadiology = async (authUser) => {
  if (authUser?.accountType === "organization") return true;
  if (!authUser?.profileId) return false;
  const m = await OrganizationMembership.findOne({ userId: authUser.profileId, isActive: true }).select("membershipRole permissionOverrides").lean();
  if (!m) return false;
  return getEffectivePermissions(m.membershipRole, m.permissionOverrides).includes("approve_radiology_reports");
};

export const reviewRadiologyReportService = async ({ id, payload, authUser }) => {
  if (!(await callerCanApproveRadiology(authUser))) throw httpError("You do not have permission to approve imaging reports.", 403);
  const order = await findScoped(id, authUser);
  if (!canReview(order)) throw httpError("Only a written report waiting for review can be approved or returned.", 409);
  const who = await actorName(authUser);
  if (reviewerConflict(order, who.userId)) throw httpError("The person who wrote the report cannot approve it. Ask a senior colleague.", 403);

  const { value, errors } = cleanReview(payload);
  if (errors.length) throw httpError(errors.join(" "), 400);
  const entry = { decision: value.decision, comment: value.comment || undefined, byName: who.name, byUserId: who.userId, at: new Date() };
  order.reviewLog = [...(order.reviewLog || []), entry];
  if (value.decision === "approve") {
    order.review = { state: "approved", byName: who.name, byUserId: who.userId, at: entry.at, comment: value.comment || undefined };
    order.returnReason = undefined;
  } else {
    order.review = undefined;
    order.returnReason = value.comment;
    order.status = "images-uploaded";
  }
  await order.save();
  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const setRadiologyNoteService = async ({ id, payload, authUser }) => {
  const order = await findScoped(id, authUser);
  if (!canEditNote(order) || order.releasedAt) throw httpError("A note cannot be changed after the report is released.", 409);
  const { text, issueType } = cleanNote(payload);
  const who = await actorName(authUser);
  const changed = (order.patientNote?.text || "") !== text;
  order.patientNote = text ? { text, issueType, byName: who.name, at: new Date() } : undefined;
  // A changed note after approval needs the senior to look again.
  if (changed && order.review?.state === "approved") {
    order.reviewLog = [...(order.reviewLog || []), { decision: "approval_withdrawn", comment: "The note for the patient was changed.", byName: who.name, byUserId: who.userId, at: new Date() }];
    order.review = undefined;
  }
  await order.save();
  const serialized = serializeOrder(order);
  broadcast("update", serialized);
  return serialized;
};

export const releaseRadiologyReportService = async ({ id, authUser }) => {
  const order = await findScoped(id, authUser);
  if (order.releasedAt) throw httpError("This report has already been released.", 409);
  if (!canRelease(order)) throw httpError("A senior must approve the report before it is released to the patient.", 409);
  const who = await actorName(authUser);

  order.releasedAt = new Date();
  order.releasedBy = who.name;
  order.status = "delivered";
  await order.save();
  const serialized = serializeOrder(order);
  broadcast("update", serialized);

  const dispatch = { inApp: "skipped", email: "skipped" };
  try {
    const profile = await UserProfile.findById(order.patientId).populate("accountId", "email");
    const account = profile?.accountId;
    const note = order.patientNote?.text ? ` Note from the imaging unit: ${order.patientNote.text}` : "";
    if (account) {
      try {
        await createNotification({
          recipientAccountId: account._id,
          type: "radiology_report_ready",
          title: order.isCritical ? "Urgent: new imaging report available" : "New imaging report available",
          body: `${order.isCritical ? "A critical imaging report has been added to your WelliRecord." : "An imaging report has been added to your WelliRecord."}${note}`.slice(0, 500),
          link: "/vault",
        });
        dispatch.inApp = "sent";
      } catch (e) { dispatch.inApp = "failed"; console.error("Radiology release notification failed:", e.message); }
    }
    if (account?.email) {
      try {
        await sendRadiologyReportReadyEmail({ email: account.email, patientName: profile.fullName, examName: order.examName, isCritical: order.isCritical });
        dispatch.email = "sent";
      } catch (e) { dispatch.email = "failed"; console.error("Radiology release email failed:", e.message); }
    }
  } catch (e) {
    console.error("[releaseRadiologyReportService] patient notification failed:", e.message);
  }
  return { order: serialized, dispatch };
};
