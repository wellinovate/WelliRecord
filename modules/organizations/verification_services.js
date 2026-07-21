import { OrganizationProfile } from "./organizations_model.js";
import cloudinary from "../../shared/config/cloudinary.js";
import { AppError } from "../../shared/errors/AppError.js";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Upload an organisation's verification document (CAC certificate / operating
 * license) to Cloudinary and record it on the org's profile as pending review.
 */
export const uploadVerificationDocumentService = async ({ accountId, file }) => {
  if (!file) {
    throw new AppError("No file was uploaded", 400, "NO_FILE_UPLOADED");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError(
      "Only PDF, JPG, and PNG files are accepted",
      400,
      "INVALID_FILE_TYPE",
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AppError("File must be under 10MB", 400, "FILE_TOO_LARGE");
  }

  const profile = await OrganizationProfile.findOne({ accountId });

  if (!profile) {
    throw new AppError(
      "Organization profile not found",
      404,
      "ORGANIZATION_PROFILE_NOT_FOUND",
    );
  }

  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "wellirecord/org-verification",
        resource_type: "auto",
        public_id: `${accountId}_${Date.now()}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    uploadStream.end(file.buffer);
  }).catch((err) => {
    throw new AppError(
      "Failed to upload document. Please try again.",
      502,
      "DOCUMENT_UPLOAD_FAILED",
    );
  });

  profile.verificationDocumentUrl = uploadResult.secure_url;
  profile.verificationDocumentName = file.originalname;
  profile.verificationDocumentUploadedAt = new Date();
  profile.verificationStatus = "pending";
  await profile.save();

  return profile;
};

/**
 * Fetch the current verification status for an organisation, used by the
 * frontend to render the correct step state on load.
 */
export const getVerificationStatusService = async ({ accountId }) => {
  const profile = await OrganizationProfile.findOne({ accountId })
    .select(
      "verificationStatus verificationDocumentName verificationDocumentUploadedAt verificationDecisionNote isLicensed",
    )
    .lean();

  if (!profile) {
    throw new AppError(
      "Organization profile not found",
      404,
      "ORGANIZATION_PROFILE_NOT_FOUND",
    );
  }

  return profile;
};
