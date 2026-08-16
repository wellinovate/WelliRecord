import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requireOrgVerified } from "../organizations/require_org_verified_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import {
  createClaimController,
  listClaimsController,
  getClaimSummaryController,
  getClaimByIdController,
  updateClaimStatusController,
} from "./pharmacy_claim_controller.js";

const router = express.Router();

router.use(protect, requireOrgVerified, requirePermission("manage_hmo_claims"));

router.post("/", createClaimController);
router.get("/", listClaimsController);
router.get("/summary", getClaimSummaryController);
router.get("/:id", getClaimByIdController);
router.patch("/:id/status", updateClaimStatusController);

export default router;
