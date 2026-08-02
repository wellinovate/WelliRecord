import cloudinary from "../../shared/config/cloudinary.js";
import { visionRecordModel } from "./vision_record_model.js";
import { Account } from "../accounts/account_model.js";

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
