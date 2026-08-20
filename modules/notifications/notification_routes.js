import express from "express";
import { protect, requireAdmin } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  listNotificationsController,
  getUnreadCountController,
  markAsReadController,
  markAllAsReadController,
  sendCriticalAlertSmsController,
  listTemplatesController,
  toggleTemplateController,
  getDeliverySummaryController,
} from "./notification_controller.js";
import { criticalAlertSmsSchema } from "./notification_validation.js";

const router = express.Router();

router.get("/", protect, listNotificationsController);
router.get("/unread-count", protect, getUnreadCountController);
router.patch("/:notificationId/read", protect, markAsReadController);
router.patch("/read-all", protect, markAllAsReadController);

router.post(
  "/critical-alert-sms",
  protect,
  validate(criticalAlertSmsSchema),
  sendCriticalAlertSmsController,
);

// Admin — templates and delivery reporting
// These three are platform-wide, not org-scoped — NotificationTemplate
// has no organizationId field at all (confirmed in the model), and
// getDeliverySummaryService aggregates DeliveryLog across every
// organization with no filter. Before this fix, any authenticated
// staff member at any single organization could disable a template
// like "Critical Lab Alert" and silently break it for every other
// organization on the platform, or see aggregate send-volume data
// across all of them. requireAdmin restricts these to actual platform
// admins, matching the same pattern admin_support_routes.js already
// uses for other platform-level resources.
router.get("/templates", protect, requireAdmin, listTemplatesController);
router.patch("/templates/:templateId/toggle", protect, requireAdmin, toggleTemplateController);
router.get("/delivery-summary", protect, requireAdmin, getDeliverySummaryController);

export default router;
