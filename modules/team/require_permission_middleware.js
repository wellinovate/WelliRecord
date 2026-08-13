// modules/team/require_permission_middleware.js
//
// Must run after `protect`. Blocks a request unless the acting staff
// member's effective permissions (role default, adjusted by any
// per-member override — see permission_registry.js) include the given
// key. This is the enforcement half of the Team Management "Access"
// panel: an admin unchecking a box in the UI didn't do anything to
// the actual API until a route is wired to check it here.
//
// Same conventions as restrictClinicalScope (clinical_scope_middleware.js):
//   - reads req.user.profileId, the field the JWT actually carries —
//     see the bugfix note in that file for why this matters.
//   - fails open (calls next()) when it can't resolve who's asking,
//     rather than being the sole gate; it only narrows what the
//     existing role/route checks already allow.
//   - the organization's own owner/admin account (accountType
//     "organization") and provider_admin members always pass, since
//     that role can't be restricted (see permission_registry.js).
//
// Usage — place after `protect` (and after restrictClinicalScope, if
// the route also has one):
//   router.post("/", protect, restrictClinicalScope("lab-orders"),
//     requirePermission("create_lab_orders"), createLabOrderController);

import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { getEffectivePermissions } from "./permission_registry.js";

export const requirePermission = (permissionKey) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Patients aren't team members and don't hold permission keys.
    // The organization's own owner account has no UserProfile/
    // membership row at all — it's the account everything else is
    // scoped under, so it always passes.
    if (req.user.role === "patient" || req.user.accountType === "organization") {
      return next();
    }

    if (!req.user.profileId) {
      return next();
    }

    const membership = await OrganizationMembership.findOne({
      userId: req.user.profileId,
      isActive: true,
    }).select("membershipRole permissionOverrides");

    if (!membership) {
      return next();
    }

    const effective = getEffectivePermissions(
      membership.membershipRole,
      membership.permissionOverrides,
    );

    if (!effective.includes(permissionKey)) {
      return res.status(403).json({
        success: false,
        message: "Your role doesn't have access to this action.",
        code: "PERMISSION_DENIED",
      });
    }

    return next();
  } catch (error) {
    next(error);
  }
};
