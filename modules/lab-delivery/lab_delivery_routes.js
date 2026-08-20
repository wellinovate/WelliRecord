import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { createUpload, DOCUMENT_MIME_TYPES } from "../../shared/middlewares/upload.js";
import {
  verifyPatientController,
  extractReportController,
  inviteUnregisteredPatientController,
  releaseLabDeliveryController,
} from "./lab_delivery_controller.js";

const router = express.Router();
const upload = createUpload({ maxSizeMB: 15, allowedMimeTypes: DOCUMENT_MIME_TYPES, maxFiles: 5 });

router.post("/verify-patient", protect, verifyPatientController);
router.post("/extract-report", protect, extractReportController);
router.post("/invite-unregistered", protect, inviteUnregisteredPatientController);
router.post("/release", protect, upload.array("reportFiles", 5), releaseLabDeliveryController);

export default router;
