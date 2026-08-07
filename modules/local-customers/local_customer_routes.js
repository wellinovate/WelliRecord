import express from "express";
import { protect } from "../auth/auth_middleware.js";
import {
  importLocalCustomersController,
  getLocalCustomersController,
  getLocalCustomerStatsController,
  confirmMatchController,
  dismissMatchController,
  sendInvitationController,
  bulkSendInvitationsController,
  getClaimInfoController,
  claimRecordController,
} from "./local_customer_controller.js";

const router = express.Router();

// ─── Public routes ────────────────────────────────────────────────────────────
// GET /api/v1/local-customers/claim/:token — get claim preview info
router.get("/claim/:token", getClaimInfoController);

// ─── Protected patient route ──────────────────────────────────────────────────
// POST /api/v1/local-customers/claim/:token — claim record with logged in patient
router.post("/claim/:token", protect, claimRecordController);

// ─── Protected provider routes ────────────────────────────────────────────────
// GET /api/v1/local-customers/stats
router.get("/stats", protect, getLocalCustomerStatsController);

// GET /api/v1/local-customers?page=1&limit=20&matchStatus=new&search=john
router.get("/", protect, getLocalCustomersController);

// POST /api/v1/local-customers/import  body: { rows: [...] }
router.post("/import", protect, importLocalCustomersController);

// POST /api/v1/local-customers/bulk-invite  body: { ids?: [...] }
router.post("/bulk-invite", protect, bulkSendInvitationsController);

// POST /api/v1/local-customers/:id/invite
router.post("/:id/invite", protect, sendInvitationController);

// PATCH /api/v1/local-customers/:id/confirm-match  body: { userId }
router.patch("/:id/confirm-match", protect, confirmMatchController);

// PATCH /api/v1/local-customers/:id/dismiss-match
router.patch("/:id/dismiss-match", protect, dismissMatchController);

export default router;
