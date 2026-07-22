import express from "express";
import { protect, requireAdmin } from "../auth/auth_middleware.js";
import {
  listVerificationsController,
  getVerificationByIdController,
  approveVerificationController,
  rejectVerificationController,
  requestMoreInfoController,
} from "./admin_verification_controller.js";

const router = express.Router();

router.get("/verifications", protect, requireAdmin, listVerificationsController);
router.get("/verifications/:id", protect, requireAdmin, getVerificationByIdController);
router.post("/verifications/:id/approve", protect, requireAdmin, approveVerificationController);
router.post("/verifications/:id/reject", protect, requireAdmin, rejectVerificationController);
router.post("/verifications/:id/request-info", protect, requireAdmin, requestMoreInfoController);

export default router;
