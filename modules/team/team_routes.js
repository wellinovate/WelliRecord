import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import { requirePermission } from "./require_permission_middleware.js";
import {
  listTeamMembersController,
  inviteTeamMemberController,
  suspendTeamMemberController,
  reactivateTeamMemberController,
  getInviteByTokenController,
  acceptInviteController,
  getRoleCatalogController,
  getPermissionRegistryController,
  updateMemberPermissionsController,
  getMyMembershipController,
} from "./team_controller.js";
import { inviteMemberSchema, acceptInviteSchema, updatePermissionsSchema } from "./team_validation.js";

const router = express.Router();

router.get("/role-catalog", protect, getRoleCatalogController);
router.get("/permissions", protect, getPermissionRegistryController);
router.get("/my-membership", protect, getMyMembershipController);

// Public routes for accepting invitation
router.get("/invite/:token", getInviteByTokenController);
router.post("/invite/:token/accept", validate(acceptInviteSchema), acceptInviteController);

// Protected routes for org admins. requirePermission("manage_team") is
// the actual enforcement — "protect" alone only confirms someone is
// logged in, not that they're allowed to invite/suspend/manage anyone.
// Without it, any authenticated doctor/nurse/etc. could call these
// directly (regardless of what the UI shows or hides), and did: since
// organizationId below is the caller's own account id, a non-admin
// calling /invite silently created a real invite scoped under their
// own account instead of the actual organization's — not a permissions
// leak exactly, but a data-integrity one, and either way not something
// a non-admin should be able to trigger at all.
router.get("/members", protect, listTeamMembersController);
router.post("/invite", protect, requirePermission("manage_team"), validate(inviteMemberSchema), inviteTeamMemberController);
router.patch("/members/:membershipId/suspend", protect, requirePermission("manage_team"), suspendTeamMemberController);
router.patch("/members/:membershipId/reactivate", protect, requirePermission("manage_team"), reactivateTeamMemberController);
router.patch(
  "/members/:membershipId/permissions",
  protect,
  requirePermission("manage_team"),
  validate(updatePermissionsSchema),
  updateMemberPermissionsController,
);

export default router;
