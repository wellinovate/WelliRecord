import express from "express";
import { protect } from "../auth/auth_middleware.js";
import {
  verifyPatientController,
  extractReportController,
  inviteUnregisteredPatientController,
  releaseLabDeliveryController,
} from "./lab_delivery_controller.js";

const router = express.Router();

router.post("/verify-patient", protect, verifyPatientController);
router.post("/extract-report", protect, extractReportController);
router.post("/invite-unregistered", protect, inviteUnregisteredPatientController);
router.post("/release", protect, releaseLabDeliveryController);

export default router;
