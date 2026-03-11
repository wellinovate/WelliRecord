import { Router } from "express";
import { createHealthRecord, getHealthRecordById, getHealthRecords, updateHealthRecord } from "../controllers/recordController.js";


const router = Router();

// Create
router.post("/records", createHealthRecord);

// Read (list)
router.get("/records", getHealthRecords);

// Read (single)
router.get("/records/:id", getHealthRecordById);

// Update
router.patch("/records/:id", updateHealthRecord);

export default router;
