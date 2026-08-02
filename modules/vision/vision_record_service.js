import cloudinary from "../../shared/config/cloudinary.js";
import { visionRecordModel } from "./vision_record_model.js";
import { Account } from "../accounts/account_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const uploadVisionPhoto = (buffer, patientId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "wellirecord/vision-records",
        resource_type: "image",
        public_id: `${patientId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });

/**
 * Creates one visit on a patient's VisionRecord. This is the only write
 * path into the schema — there is no patient-facing equivalent. Every
 * caller must be an authenticated provider account; that check happens
 * here, not just at the route middleware layer, so the rule holds even
 * if the route is ever reused elsewhere.
 */
export const createVisionVisitService = async ({
  patientId,
  actingAccountId,
  wrOrgId,
  clinicName,
  acuity,
  colorVision,
  lensPrescription,
  diagnosis,
  treatment,
  photoFiles = [],
}) => {
  const provider = await Account.findById(actingAccountId);

  if (!provider || provider.role !== "provider") {
    const error = new Error("Only a provider account can add a vision record entry");
    error.statusCode = 403;
    throw error;
  }

  const patient = await Account.findById(patientId);
  if (!patient) {
    const error = new Error("Patient not found");
    error.statusCode = 404;
    throw error;
  }

  // Resolved the same way getAllPatientMedicationsService looks it up on
  // the read side — a missing/unmatched wrOrgId leaves organizationId
  // null rather than blocking the write, since a provider being unable
  // to record a vision visit over an org-lookup mismatch is worse than
  // that visit not showing up in the org-wide list later.
  let organizationId = null;
  if (wrOrgId) {
    const organization = await OrganizationProfile.findOne({ wrOrgId });
    organizationId = organization?._id || null;
  }

  for (const file of photoFiles) {
    if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.mimetype)) {
      const error = new Error("Only JPG, PNG, and WEBP images are accepted");
      error.statusCode = 400;
      throw error;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      const error = new Error("Each photo must be under 5MB");
      error.statusCode = 400;
      throw error;
    }
  }

  const uploadResults = await Promise.all(
    photoFiles.map((file) => uploadVisionPhoto(file.buffer, patientId)),
  ).catch(() => {
    const error = new Error("Failed to upload one or more photos. Please try again.");
    error.statusCode = 502;
    throw error;
  });

  const photos = uploadResults.map((result) => ({
    url: result.secure_url,
    publicId: result.public_id,
    caption: "",
  }));

  const providerName =
    provider.fullName ||
    [provider.firstName, provider.lastName].filter(Boolean).join(" ") ||
    provider.email;

  const visit = {
    date: new Date(),
    clinicName,
    providerId: provider._id,
    providerName,
    organizationId,
    acuity,
    colorVision,
    lensPrescription,
    diagnosis,
    treatment,
    photos,
    provenance: {
      enteredBy: provider._id,
      enteredByRole: "provider",
      clinic: clinicName,
      enteredAt: new Date(),
      source: "provider-entered",
    },
  };

  const record = await visionRecordModel.findOneAndUpdate(
    { patientId },
    { $push: { visits: visit }, $setOnInsert: { patientId } },
    { upsert: true, new: true },
  );

  return record;
};

/**
 * Org-wide vision visit list for the standalone provider Vision page —
 * same shape and pagination convention as getAllPatientMedicationsService,
 * since that's the existing precedent for a per-org, cross-patient list.
 * Visits recorded before the organizationId field existed won't appear
 * here; they're still visible on the per-patient read path.
 */
export const getAllPatientVisionService = async ({
  page = 1,
  limit = 10,
  wrOrgId,
}) => {
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const error = new Error("Organization not found for this account");
    error.statusCode = 404;
    throw error;
  }

  const organizationId = organization._id;
  const skip = (page - 1) * limit;

  const matchStage = { "visits.organizationId": organizationId };

  const [items, totalResult] = await Promise.all([
    visionRecordModel.aggregate([
      { $unwind: "$visits" },
      { $match: matchStage },
      { $sort: { "visits.date": -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: "$visits._id",
          patientId: "$patientId",
          date: "$visits.date",
          clinicName: "$visits.clinicName",
          providerId: "$visits.providerId",
          providerName: "$visits.providerName",
          acuity: "$visits.acuity",
          colorVision: "$visits.colorVision",
          lensPrescription: "$visits.lensPrescription",
          diagnosis: "$visits.diagnosis",
          treatment: "$visits.treatment",
          photos: "$visits.photos",
        },
      },
    ]),
    visionRecordModel.aggregate([
      { $unwind: "$visits" },
      { $match: matchStage },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Read path for both the provider history view and the patient profile
 * section. Same query either way — access control (who is allowed to
 * call this at all) lives in the route/controller, not here.
 */
export const getVisionRecordService = async ({ patientId }) => {
  const record = await visionRecordModel.findOne({ patientId }).lean();

  if (!record) {
    return { patientId, visits: [] };
  }

  record.visits.sort((a, b) => new Date(b.date) - new Date(a.date));
  return record;
};
