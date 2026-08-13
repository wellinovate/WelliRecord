import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";

// The only categories an "eye_care" scoped facility's providers may
// access, for any patient, regardless of what AccessGrant would
// otherwise allow. Matches VisionRecord spec section 6 (Integration
// with WelliRecord) — the same context VisionRecord itself already
// reads from the patient profile, plus Vision itself.
const EYE_CARE_ALLOWED_CATEGORIES = new Set([
  "vision",
  "demographics",
  "allergies",
  "medications",
  "diagnoses",
]);

/**
 * Must run after `protect`. Resolves the acting provider's organization
 * and, if that organization is clinical-scope-restricted, blocks the
 * request unless `category` is on the allowed list for that scope.
 *
 * This is deliberately API-level, not UI-level — hiding a tab in the
 * frontend does not stop a direct request to this route, so the check
 * has to live here to mean anything. The frontend should still hide
 * the corresponding nav/tab entries as a UX courtesy, but that hiding
 * is not the security boundary; this middleware is.
 *
 * Usage: place after `protect` on every route file for a restricted
 * category:
 *   router.get("/patient/:patientId", protect, restrictClinicalScope("vitals"), getPatientVitalsController);
 */
export const restrictClinicalScope = (category) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Only provider-side accounts belong to an organization at all.
    // Patient accounts have no membership row and are never restricted
    // by this middleware.
    if (req.user.role === "patient") {
      return next();
    }

    // BUGFIX: the JWT payload signed at login (shared/utils/helper.js,
    // signAccessToken) only ever sets `sub` (Account._id) and
    // `profileId` (UserProfile._id) — it never sets `accountId` or
    // `id`. This line always evaluated to undefined, so
    // UserProfile.findOne below always returned null and this
    // middleware silently fell through to next() for every request —
    // the eye-care category restriction below was never actually
    // enforced. Fixed to read the field the token actually has.
    if (req.user.profileId) {
      const membership = await OrganizationMembership.findOne({
        userId: req.user.profileId,
        isActive: true,
      }).select("organizationId");

      if (!membership) {
        return next();
      }

      const org = await OrganizationProfile
        .findOne({ accountId: membership.organizationId })
        .select("clinicalScope");

      if (!org || org.clinicalScope === "general") {
        return next();
      }

      if (org.clinicalScope === "eye_care" && !EYE_CARE_ALLOWED_CATEGORIES.has(category)) {
        return res.status(403).json({
          success: false,
          message:
            "This facility is registered as an eye care provider and does not have access to this record category.",
        });
      }

      return next();
    }

    // No profileId on the token (e.g. the organization's own owner
    // account, which authenticates with accountType "organization" and
    // has no UserProfile) — fail open to the existing role/access
    // checks rather than blocking here; this middleware only adds a
    // restriction, it should never be the sole gate that grants access.
    return next();
  } catch (error) {
    next(error);
  }
};
