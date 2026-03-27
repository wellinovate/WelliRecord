import express from "express";
import { protect } from "../auth/auth_middleware.js";
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
  validate(createEncounterSchema),
  createEncounterController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientEncountersParamsSchema, "params"),
  getPatientEncountersController,
);

export default router;