import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
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

router.post(
  "/",
  protect,
  restrictClinicalScope("encounters"),
  validate(createEncounterSchema),
  createEncounterController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("encounters"),
  validate(getPatientEncountersParamsSchema, "params"),
  getPatientEncountersController,
);

export default router;