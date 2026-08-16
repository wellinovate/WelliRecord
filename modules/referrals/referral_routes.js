import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requireOrgVerified } from "../organizations/require_org_verified_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import {
  createReferralController,
  listSentReferralsController,
  listReceivedReferralsController,
  getReferralByIdController,
  updateReferralStatusController,
} from "./referral_controller.js";

const router = express.Router();

router.use(protect, requireOrgVerified);

// "cancelled" is the sender withdrawing their own referral — gated on
// create_referrals, the same permission that let them send it.
// accepted/declined/completed are the receiving side acting on a
// referral sent to them — gated on respond_to_referrals. One route,
// two different permission keys depending on which transition is
// actually being requested; the service's transition table still
// enforces which org side may make which move.
const requireReferralStatusPermission = (req, res, next) => {
  const key = req.body?.status === "cancelled" ? "create_referrals" : "respond_to_referrals";
  return requirePermission(key)(req, res, next);
};

router.post("/", requirePermission("create_referrals"), createReferralController);
router.get("/sent", requirePermission("view_referrals"), listSentReferralsController);
router.get("/received", requirePermission("view_referrals"), listReceivedReferralsController);
router.get("/:id", requirePermission("view_referrals"), getReferralByIdController);
router.patch("/:id/status", requireReferralStatusPermission, updateReferralStatusController);

export default router;
