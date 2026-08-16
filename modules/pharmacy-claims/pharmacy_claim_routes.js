import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requireOrgVerified } from "../organizations/require_org_verified_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import {
  createClaimController,
  listClaimsController,
  getClaimSummaryController,
  listMyClaimsController,
  getClaimByIdController,
  updateClaimStatusController,
} from "./pharmacy_claim_controller.js";

const router = express.Router();

// Patient-facing — deliberately NOT behind requireOrgVerified (a
// patient account has no organization to verify) or
// requirePermission("manage_hmo_claims") (a pharmacy-role permission).
// Just needs to be logged in as themselves.
router.get("/mine", protect, listMyClaimsController);

router.use(protect, requireOrgVerified, requirePermission("manage_hmo_claims"));

router.post("/", createClaimController);
router.get("/", listClaimsController);
router.get("/summary", getClaimSummaryController);
router.get("/:id", getClaimByIdController);
router.patch("/:id/status", updateClaimStatusController);

export default router;
