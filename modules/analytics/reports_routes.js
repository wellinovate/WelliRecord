import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { requireOrgVerified } from "../organizations/require_org_verified_middleware.js";
import { getReportsOverviewController } from "./reports_controller.js";

const router = express.Router();

router.get(
  "/reports/overview",
  protect,
  requireOrgVerified,
  requirePermission("view_reports"),
  getReportsOverviewController,
);

export default router;
