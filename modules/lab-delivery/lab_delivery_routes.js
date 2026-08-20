import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { createUpload, DOCUMENT_MIME_TYPES } from "../../shared/middlewares/upload.js";
import {
  verifyPatientController,
  extractReportController,
  inviteUnregisteredPatientController,
  releaseLabDeliveryController,
} from "./lab_delivery_controller.js";

const router = express.Router();
const upload = createUpload({ maxSizeMB: 15, allowedMimeTypes: DOCUMENT_MIME_TYPES, maxFiles: 5 });

// Was `protect` only on every route in this file — any authenticated
// staff member at any organization, regardless of role, could verify a
// patient's identity (revealing their masked phone/email), or release
// a lab result under any organization's name for any patient. Reusing
// write_lab_results here rather than inventing a new key — it's the
// same permission lab_order_routes.js already gates result-entry
// behind, and this flow is the external-report equivalent of that same
// action.
router.post("/verify-patient", protect, requirePermission("write_lab_results"), verifyPatientController);
router.post("/extract-report", protect, requirePermission("write_lab_results"), extractReportController);
router.post("/invite-unregistered", protect, requirePermission("write_lab_results"), inviteUnregisteredPatientController);
router.post(
  "/release",
  protect,
  requirePermission("write_lab_results"),
  upload.array("reportFiles", 5),
  releaseLabDeliveryController,
);

export default router;
