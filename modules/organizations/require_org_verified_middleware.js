import { OrganizationProfile } from "./organizations_model.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";

/**
 * Must run after `protect`. Blocks provider-side patient/staff endpoints
 * until the organisation's identity/licence verification has been
 * reviewed and approved — this is the "Org Verification" the provider
 * login page's marketing copy already claims ("Every provider undergoes
 * identity and licence verification before gaining access"), which
 * until now was never actually enforced anywhere.
 *
 * Resolution mirrors getMyOrganizationService (verification_services.js):
 * org owners are found by accountId directly; staff (doctor, nurse, lab
 * tech, ...) are found via their OrganizationMembership, keyed by
 * req.user.profileId, since staff JWTs don't carry organizationId. Same
 * lookup, so verification status is enforced consistently for both.
 *
 * Deliberately NOT applied to /verify-org/document, /verify-org/status,
 * /me, or /logo — an org still going through review needs those to
 * submit documents, check status, and see its own profile.
 */
export const requireOrgVerified = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;
    const profileId = req.user?.profileId;

    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    let profile = await OrganizationProfile.findOne({ accountId })
      .select("verificationStatus organizationName")
      .lean();

    if (!profile && profileId) {
      const membership = await OrganizationMembership.findOne({
        userId: profileId,
        isActive: true,
      }).lean();

      if (membership) {
        profile = await OrganizationProfile.findOne({
          accountId: membership.organizationId,
        })
          .select("verificationStatus organizationName")
          .lean();
      }
    }

    if (!profile) {
      return res.status(403).json({
        success: false,
        message: "No organisation profile is associated with this account.",
        code: "ORGANIZATION_PROFILE_NOT_FOUND",
      });
    }

    if (profile.verificationStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message:
          "Your organisation's verification is still under review. Submit or check your verification documents to continue.",
        code: "ORG_NOT_VERIFIED",
        verificationStatus: profile.verificationStatus,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
