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

const router = express.Router();

router.post("/walk-in", protect, createWalkInQueueController);
router.get("/", getQueueController);
router.get("/:queueId", getQueueByIdController);
router.patch("/:queueId/status", updateQueueStatusController);
router.patch("/:queueId/triage", protect, saveTriageController);
router.post("/:queueId/start-encounter", protect, startEncounterFromQueueController);
router.post("/:queueId/complete", completeQueueVisitController);

export default router;