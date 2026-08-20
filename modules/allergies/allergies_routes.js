import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { requireWriteConsent } from "../access/require_write_consent_middleware.js";
import {
  createAllergyController,
  getPatientAllergiesController,
} from "./allergies_controller.js";
import {
  createAllergySchema,
  getPatientAllergiesParamsSchema,
} from "./allergies_validation.js";
import { validate } from "../../shared/middlewares/validator.js";

const router = express.Router();

// Was `protect` only, same gap as diagnoses (see that file's note).
// Worth calling out specifically for allergies: this is the single
// highest-priority clinical category on this platform by design (the
// founding story is a missed allergy record) — it had the weakest
// write protection of any clinical module, not the strongest.
router.post(
  "/",
  protect,
  restrictClinicalScope("allergies"),
  requirePermission("write_clinical_records"),
  validate(createAllergySchema),
  requireWriteConsent("allergies"),
  createAllergyController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("allergies"),
  requirePermission("view_clinical_records"),
  validate(getPatientAllergiesParamsSchema, "params"),
  getPatientAllergiesController,
);

export default router;
