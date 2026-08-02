import express from "express";
import multer from "multer";
import { protect, requireRole } from "../auth/auth_middleware.js";
import {
  createVisionVisitController,
  getVisionRecordController,
  getAllPatientVisionController,
} from "./vision_record_controller.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Write: provider only. requireRole runs in addition to the check
// inside vision_record_service.js — belt and suspenders, since this is
// a clinical-accuracy rule (spec section 2), not just an access rule.
router.post(
  "/:patientId/visits",
  protect,
  requireRole("provider"),
  upload.array("photos", 6),
  createVisionVisitController,
);

// Org-wide list for the standalone provider Vision page. Placed before
// "/:patientId" — otherwise Express would match "patients" as a
// patientId value and this route would never be reached.
router.get("/patients", protect, requireRole("provider"), getAllPatientVisionController);

// Read: any authenticated account that already has access to this
// patient's record (the patient themselves, or a provider with a
// standing access grant) can read. This route intentionally does not
// duplicate WelliRecord's access-grant logic — it defers to the same
// `protect` + record-access check every other record-read route uses.
router.get("/:patientId", protect, getVisionRecordController);

export default router;
