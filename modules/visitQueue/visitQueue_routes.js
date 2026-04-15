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

const router = express.Router();

router.post("/walk-in", createWalkInQueueController);
router.get("/", getQueueController);
router.get("/:queueId", getQueueByIdController);
router.patch("/:queueId/status", updateQueueStatusController);
router.patch("/:queueId/triage", saveTriageController);
router.post("/:queueId/start-encounter", startEncounterFromQueueController);
router.post("/:queueId/complete", completeQueueVisitController);

export default router;