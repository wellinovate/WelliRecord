import express from "express";
import {
  createWalkInQueueController,
  getQueueController,
  getQueueByIdController,
  updateQueueStatusController,
  saveTriageController,
  startEncounterFromQueueController,
  completeQueueVisitController,
} from "./visitQueue_controller.js";
import { protect } from "../auth/auth_middleware.js";
import { requireOrgVerified } from "../organizations/require_org_verified_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";

const router = express.Router();

// BUGFIX: GET /:queueId, PATCH /:queueId/status, and POST
// /:queueId/complete had no `protect` at all — any unauthenticated
// request could read full patient details (name, WR ID, phone,
// gender, DOB, encounter notes) or change/complete a queue item.
// `protect` now applies to every route below, and each service call
// additionally checks the queue item's organizationId against the
// caller's own org (see assertQueueItemOwnership in
// visitQueue_service.js) — protect alone only proves someone is
// logged in, not that they belong to the facility this patient's
// queue item is actually at.
router.use(protect, requireOrgVerified);

router.post("/walk-in", requirePermission("manage_queue"), createWalkInQueueController);
router.get("/", requirePermission("view_patients"), getQueueController);
router.get("/:queueId", requirePermission("view_patients"), getQueueByIdController);
router.patch("/:queueId/status", requirePermission("manage_queue"), updateQueueStatusController);
router.patch("/:queueId/triage", requirePermission("manage_queue"), saveTriageController);
router.post("/:queueId/start-encounter", requirePermission("write_clinical_records"), startEncounterFromQueueController);
router.post("/:queueId/complete", requirePermission("write_clinical_records"), completeQueueVisitController);

export default router;
