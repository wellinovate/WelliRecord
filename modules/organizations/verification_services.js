import { OrganizationProfile } from "./organizations_model.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
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

const ALLOWED_LOGO_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Upload a facility's own logo for branding — shown in place of the
 * generic org-type icon in the provider sidebar and, later, on
 * patient-facing WelliBridge surfaces. Mirrors
 * uploadVerificationDocumentService's Cloudinary pattern above, in a
 * separate folder so a logo swap can never touch verification
 * documents.
 */
export const uploadOrganizationLogoService = async ({ accountId, file }) => {
  if (!file) {
    throw new AppError("No image was uploaded", 400, "NO_FILE_UPLOADED");
  }

  if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError(
      "Only JPG, PNG, WEBP, and SVG images are accepted",
      400,
      "INVALID_FILE_TYPE",
    );
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new AppError("Image must be under 5MB", 400, "FILE_TOO_LARGE");
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
        folder: "wellirecord/org-logos",
        resource_type: "image",
        public_id: `${accountId}_${Date.now()}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    uploadStream.end(file.buffer);
  }).catch(() => {
    throw new AppError(
      "Failed to upload logo. Please try again.",
      502,
      "LOGO_UPLOAD_FAILED",
    );
  });

  profile.logo = uploadResult.secure_url;
  await profile.save();

  return profile;
};

/**
 * Clears the facility's logo — the sidebar and any branded surfaces
 * fall back to the default WelliRecord mark / org-type icon. Doesn't
 * delete the asset from Cloudinary; only detaches it from the profile.
 */
export const removeOrganizationLogoService = async ({ accountId }) => {
  const profile = await OrganizationProfile.findOne({ accountId });

  if (!profile) {
    throw new AppError(
      "Organization profile not found",
      404,
      "ORGANIZATION_PROFILE_NOT_FOUND",
    );
  }

  profile.logo = null;
  await profile.save();

  return profile;
};

export const getMyOrganizationService = async ({ accountId, profileId }) => {
  let profile = await OrganizationProfile.findOne({ accountId }).lean();

  // Org owners find their profile directly above. Staff (doctor, nurse,
  // etc.) never own an OrganizationProfile — they belong to one via an
  // OrganizationMembership row instead, keyed by their UserProfile id
  // (profileId, from the JWT), not their account id.
  if (!profile && profileId) {
    const membership = await OrganizationMembership.findOne({
      userId: profileId,
      isActive: true,
    }).lean();

    if (membership) {
      profile = await OrganizationProfile.findOne({
        accountId: membership.organizationId,
      }).lean();
    }
  }

  if (!profile) {
    throw new AppError(
      "Organization profile not found",
      404,
      "ORGANIZATION_PROFILE_NOT_FOUND",
    );
  }

  return profile;
};
