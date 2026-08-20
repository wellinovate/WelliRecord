import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { requireWriteConsent } from "../access/require_write_consent_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createMedicationController,
  getAllPatientMedicationsController,
  getPatientMedicationsController,
} from "./medication_controller.js";
import {
  createMedicationSchema,
  getPatientMedicationsParamsSchema,
} from "./medications_validator.js";

const router = express.Router();

// Already had requireWriteConsent on create — was still missing
// restrictClinicalScope and requirePermission on all three routes,
// same gap as diagnoses/allergies (see those files' notes).
router.post(
  "/",
  protect,
  restrictClinicalScope("medications"),
  requirePermission("write_clinical_records"),
  validate(createMedicationSchema),
  requireWriteConsent("medications"),
  createMedicationController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("medications"),
  requirePermission("view_clinical_records"),
  validate(getPatientMedicationsParamsSchema, "params"),
  getPatientMedicationsController,
);

router.get(
  "/patients",
  protect,
  restrictClinicalScope("medications"),
  requirePermission("view_clinical_records"),
  getAllPatientMedicationsController,
);

export default router;
