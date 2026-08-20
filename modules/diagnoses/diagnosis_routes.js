import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { requireWriteConsent } from "../access/require_write_consent_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createDiagnosisController,
  getPatientDiagnosesController,
} from "./diagnoses_controller.js";
import {
  createDiagnosisSchema,
  getPatientDiagnosesParamsSchema,
} from "./diagnosis_validation.js";

const router = express.Router();

// Was `protect` only — no restrictClinicalScope, no requirePermission,
// no requireWriteConsent, unlike every sibling clinical module
// (procedure, immunizations, encounter all have the first two;
// medications and lab-orders already have write-consent). Any
// authenticated staff member at any organization, any role, could
// create or view any patient's diagnoses. write_clinical_records/
// view_clinical_records match what procedure/immunizations/encounter
// already use for the same shape of route.
router.post(
  "/",
  protect,
  restrictClinicalScope("diagnoses"),
  requirePermission("write_clinical_records"),
  validate(createDiagnosisSchema),
  requireWriteConsent("diagnoses"),
  createDiagnosisController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("diagnoses"),
  requirePermission("view_clinical_records"),
  validate(getPatientDiagnosesParamsSchema, "params"),
  getPatientDiagnosesController,
);

export default router;
