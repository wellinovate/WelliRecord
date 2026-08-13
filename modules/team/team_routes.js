import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  listTeamMembersController,
  inviteTeamMemberController,
  suspendTeamMemberController,
  reactivateTeamMemberController,
  getInviteByTokenController,
  acceptInviteController,
  getRoleCatalogController,
} from "./team_controller.js";
import { inviteMemberSchema, acceptInviteSchema } from "./team_validation.js";

const router = express.Router();

router.get("/role-catalog", protect, getRoleCatalogController);

// Public routes for accepting invitation
router.get("/invite/:token", getInviteByTokenController);
router.post("/invite/:token/accept", validate(acceptInviteSchema), acceptInviteController);

// Protected routes for org admins
router.get("/members", protect, listTeamMembersController);
router.post("/invite", protect, validate(inviteMemberSchema), inviteTeamMemberController);
router.patch("/members/:membershipId/suspend", protect, suspendTeamMemberController);
router.patch("/members/:membershipId/reactivate", protect, reactivateTeamMemberController);

export default router;
