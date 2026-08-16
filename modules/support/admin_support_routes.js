import express from "express";
import { protect, requireAdmin } from "../auth/auth_middleware.js";
import {
  listTicketsAdminController,
  getTicketAdminController,
  updateStatusController,
  updatePriorityController,
  assignTicketController,
  unassignTicketController,
  addInternalNoteController,
  adminReplyController,
  getConsentActivityController,
} from "./admin_support_controller.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/tickets", listTicketsAdminController);
router.get("/tickets/:id", getTicketAdminController);
router.patch("/tickets/:id/status", updateStatusController);
router.patch("/tickets/:id/priority", updatePriorityController);
router.post("/tickets/:id/assign", assignTicketController);
router.post("/tickets/:id/unassign", unassignTicketController);
router.post("/tickets/:id/notes", addInternalNoteController);
router.post("/tickets/:id/reply", adminReplyController);
router.get("/tickets/:id/consent-activity", getConsentActivityController);

export default router;
