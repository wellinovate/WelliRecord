import express from "express";
import { protect } from "../auth/auth_middleware.js";
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

router.post(
  "/",
  protect,
  validate(createDiagnosisSchema),
  createDiagnosisController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientDiagnosesParamsSchema, "params"),
  getPatientDiagnosesController,
);

export default router;