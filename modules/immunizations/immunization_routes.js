import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createImmunizationController,
  getPatientImmunizationsController,
} from "./immunization_controller.js";
import {
  createImmunizationSchema,
  getPatientImmunizationsParamsSchema,
} from "./immunization_validation.js";

const router = express.Router();

router.post(
  "/",
  protect,
  restrictClinicalScope("immunizations"),
  validate(createImmunizationSchema),
  createImmunizationController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("immunizations"),
  validate(getPatientImmunizationsParamsSchema, "params"),
  getPatientImmunizationsController,
);

export default router;