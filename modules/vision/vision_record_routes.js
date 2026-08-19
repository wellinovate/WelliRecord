import express from "express";
import { protect, requireRole } from "../auth/auth_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import {
  createVisionVisitController,
  getVisionRecordController,
  getAllPatientVisionController,
} from "./vision_record_controller.js";

// Up to 6 photos per visit (see upload.array("photos", 6) below).
const upload = createUpload({ maxSizeMB: 10, allowedMimeTypes: IMAGE_MIME_TYPES, maxFiles: 6 });
const router = express.Router();

// Write: provider-side accounts only. requireRole runs in addition to
// the check inside vision_record_service.js — belt and suspenders,
// since this is a clinical-accuracy rule (spec section 2), not just an
// access rule. Lists every non-patient role from Account.role's enum
// rather than just "provider" — a doctor, nurse, admin, etc. account
// is still provider-side and was otherwise getting a 403 here despite
// having access to every other provider route in the app.
const PROVIDER_SIDE_ROLES = [
  "provider",
  "doctor",
  "nurse",
  "caregiver",
  "staff",
  "admin",
  "provider_admin",
];

router.post(
  "/:patientId/visits",
  protect,
  requireRole(...PROVIDER_SIDE_ROLES),
  requirePermission("write_vision_records"),
  upload.array("photos", 6),
  createVisionVisitController,
);

// Org-wide list for the standalone provider Vision page. Placed before
// "/:patientId" — otherwise Express would match "patients" as a
// patientId value and this route would never be reached.
router.get(
  "/patients",
  protect,
  requireRole(...PROVIDER_SIDE_ROLES),
  requirePermission("view_vision_records"),
  getAllPatientVisionController,
);

// Read: any authenticated account that already has access to this
// patient's record (the patient themselves, or a provider with a
// standing access grant) can read. This route intentionally does not
// duplicate WelliRecord's access-grant logic — it defers to the same
// `protect` + record-access check every other record-read route uses.
// requirePermission runs too — it's a no-op for the patient themselves
// (patients are exempted inside the middleware) and only narrows the
// provider-side case.
router.get("/:patientId", protect, requirePermission("view_vision_records"), getVisionRecordController);

export default router;
