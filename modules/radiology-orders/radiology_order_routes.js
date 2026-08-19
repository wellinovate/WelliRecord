import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { requireWriteConsent } from "../access/require_write_consent_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createRadiologyOrderController,
  getAllRadiologyOrdersController,
  updateRadiologyOrderStatusController,
  uploadRadiologyImageController,
  publishRadiologyReportController,
} from "./radiology_order_controller.js";
import { createUpload, RADIOLOGY_MIME_TYPES } from "../../shared/middlewares/upload.js";
import {
  createRadiologyOrderSchema,
  updateRadiologyOrderStatusSchema,
  publishRadiologyReportSchema,
} from "./radiology_order_validation.js";

const router = express.Router();
// 50MB covers a single DICOM slice/image comfortably; revisit if real
// multi-frame studies coming through this route need more.
const upload = createUpload({ maxSizeMB: 50, allowedMimeTypes: RADIOLOGY_MIME_TYPES, maxFiles: 1 });

router.get(
  "/",
  protect,
  restrictClinicalScope("radiology"),
  requirePermission("view_radiology_orders"),
  getAllRadiologyOrdersController,
);

router.post(
  "/",
  protect,
  restrictClinicalScope("radiology"),
  requirePermission("create_radiology_orders"),
  validate(createRadiologyOrderSchema),
  requireWriteConsent("radiology"),
  createRadiologyOrderController,
);

router.patch(
  "/:id/status",
  protect,
  restrictClinicalScope("radiology"),
  requirePermission("view_radiology_orders"),
  validate(updateRadiologyOrderStatusSchema),
  updateRadiologyOrderStatusController,
);

router.post(
  "/:id/images",
  protect,
  restrictClinicalScope("radiology"),
  requirePermission("write_radiology_reports"),
  upload.single("file"),
  uploadRadiologyImageController,
);

router.patch(
  "/:id/report",
  protect,
  restrictClinicalScope("radiology"),
  requirePermission("write_radiology_reports"),
  validate(publishRadiologyReportSchema),
  publishRadiologyReportController,
);

export default router;
