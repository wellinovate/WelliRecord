import express from "express";
import { protect } from "../auth/auth_middleware.js";
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
router.get("/templates", protect, listTemplatesController);
router.patch("/templates/:templateId/toggle", protect, toggleTemplateController);
router.get("/delivery-summary", protect, getDeliverySummaryController);

export default router;
