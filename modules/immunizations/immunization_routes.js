import express from "express";
import { protect } from "../auth/auth_middleware.js";
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
  validate(createImmunizationSchema),
  createImmunizationController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientImmunizationsParamsSchema, "params"),
  getPatientImmunizationsController,
);

export default router;