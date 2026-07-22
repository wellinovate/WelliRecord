import { OrganizationProfile } from "../organizations/organizations_model.js";
import { AppError } from "../../shared/errors/AppError.js";

/**
 * Maps an OrganizationProfile document to the shape the admin frontend's
 * VerificationRequest type expects. Only orgs that have actually submitted
 * (verificationStatus !== 'not_submitted') are relevant to a review queue.
 */
const toVerificationRequest = (profile) => ({
  id: String(profile._id),
  type: "facility",
  submittedBy: String(profile.accountId),
  submittedByName: profile.organizationName,
  submittedAt: profile.createdAt,
  status: profile.verificationStatus,
  documents: profile.verificationDocumentUrl
    ? [
        {
          id: String(profile._id),
          label: profile.verificationDocumentName || "Verification document",
          url: profile.verificationDocumentUrl,
          uploadedAt: profile.verificationDocumentUploadedAt,
        },
      ]
    : [],
  reviewedBy: profile.verificationReviewedBy
    ? String(profile.verificationReviewedBy)
    : undefined,
  reviewedAt: profile.verificationReviewedAt || undefined,
  decisionNote: profile.verificationDecisionNote || undefined,
  facilityType: profile.organizationType,
  cacNumber: profile.registrationNumber || undefined,
  facilityLicense: profile.licenseNumber || undefined,
});

export const listVerificationsService = async ({ status } = {}) => {
  const query = { verificationStatus: { $ne: "not_submitted" } };

  if (status) {
    query.verificationStatus = status;
  }

  const profiles = await OrganizationProfile.find(query)
    .sort({ verificationDocumentUploadedAt: -1 })
    .lean();

  return profiles.map(toVerificationRequest);
};

export const getVerificationByIdService = async (id) => {
  const profile = await OrganizationProfile.findById(id).lean();

  if (!profile) {
    throw new AppError("Verification request not found", 404, "VERIFICATION_NOT_FOUND");
  }

  return toVerificationRequest(profile);
};

const applyDecision = async ({ id, reviewerId, status, note, setLicensed }) => {
  const profile = await OrganizationProfile.findById(id);

  if (!profile) {
    throw new AppError("Verification request not found", 404, "VERIFICATION_NOT_FOUND");
  }

  profile.verificationStatus = status;
  profile.verificationDecisionNote = note || null;
  profile.verificationReviewedBy = reviewerId || null;
  profile.verificationReviewedAt = new Date();

  if (setLicensed !== undefined) {
    profile.isLicensed = setLicensed;
  }

  await profile.save();

  return toVerificationRequest(profile.toObject());
};

export const approveVerificationService = async ({ id, reviewerId, note }) =>
  applyDecision({ id, reviewerId, status: "approved", note, setLicensed: true });

export const rejectVerificationService = async ({ id, reviewerId, note }) =>
  applyDecision({ id, reviewerId, status: "rejected", note, setLicensed: false });

export const requestMoreInfoService = async ({ id, reviewerId, note }) =>
  applyDecision({ id, reviewerId, status: "more_info_requested", note });
