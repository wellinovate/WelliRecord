import express from "express";
import multer from "multer";
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
import {
  createRadiologyOrderSchema,
  updateRadiologyOrderStatusSchema,
  publishRadiologyReportSchema,
} from "./radiology_order_validation.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
