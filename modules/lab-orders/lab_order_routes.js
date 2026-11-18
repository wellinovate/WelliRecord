import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission, requireAnyPermission } from "../team/require_permission_middleware.js";
import { requireWriteConsent } from "../access/require_write_consent_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createLabOrderController,
  getAllLabOrdersController,
  updateLabOrderStatusController,
  enterLabOrderResultController,
  previewLabOrderResultController,
  listCriticalAlertsController,
  acknowledgeCriticalAlertController,
  verifyLabOrderResultController,
} from "./lab_order_controller.js";
import {
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  enterLabOrderResultSchema,
} from "./lab_order_validation.js";

const router = express.Router();

router.get(
  "/",
  protect,
  restrictClinicalScope("lab-orders"),
  requirePermission("view_lab_orders"),
  getAllLabOrdersController,
);

router.post(
  "/",
  protect,
  restrictClinicalScope("lab-orders"),
  requirePermission("create_lab_orders"),
  validate(createLabOrderSchema),
  requireWriteConsent("lab-results"),
  createLabOrderController,
);

router.get(
  "/critical-alerts",
  protect,
  restrictClinicalScope("lab-orders"),
  requireAnyPermission("view_lab_orders", "write_lab_results"),
  listCriticalAlertsController,
);

router.patch(
  "/critical-alerts/:id/acknowledge",
  protect,
  restrictClinicalScope("lab-orders"),
  requirePermission("write_lab_results"),
  acknowledgeCriticalAlertController,
);

router.patch(
  "/:id/status",
  protect,
  restrictClinicalScope("lab-orders"),
  requireAnyPermission("create_lab_orders", "write_lab_results"),
  validate(updateLabOrderStatusSchema),
  updateLabOrderStatusController,
);

router.patch(
  "/:id/result",
  protect,
  restrictClinicalScope("lab-orders"),
  requirePermission("write_lab_results"),
  validate(enterLabOrderResultSchema),
  enterLabOrderResultController,
);

router.post(
  "/:id/result/preview",
  protect,
  restrictClinicalScope("lab-orders"),
  requirePermission("write_lab_results"),
  validate(enterLabOrderResultSchema),
  previewLabOrderResultController,
);

router.patch(
  "/:id/verify",
  protect,
  restrictClinicalScope("lab-orders"),
  requirePermission("write_lab_results"),
  verifyLabOrderResultController,
);

export default router;
