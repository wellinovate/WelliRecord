import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createEncounterController,
  getPatientEncountersController,
} from "./encounter_controller.js";
import {
  createEncounterSchema,
  getPatientEncountersParamsSchema,
} from "./encounter_validation.js";

const router = express.Router();

// NOTE: this route had no restrictClinicalScope at all before this
// change, unlike vitals/lab-orders/pharmacy-orders — "encounters" is
// one of the categories an eye-care-scoped facility shouldn't have
// (see clinical_scope_middleware.js's EYE_CARE_ALLOWED_CATEGORIES), so
// it was open regardless of clinical scope. Added here for
// consistency with the other clinical routes.
router.post(
  "/",
  protect,
  restrictClinicalScope("encounters"),
  requirePermission("write_clinical_records"),
  validate(createEncounterSchema),
  createEncounterController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("encounters"),
  requirePermission("view_clinical_records"),
  validate(getPatientEncountersParamsSchema, "params"),
  getPatientEncountersController,
);

export default router;