import express from "express";
import { diagnosisController } from "./diagnoses_controller.js";
import {
  validateCreateDiagnosis,
  validateUpdateDiagnosis,
} from "./diagnosis_validation.js";
import { validateBody, validateParams } from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post("/", validateBody(validateCreateDiagnosis), diagnosisController.create);
router.get("/:id", validateParams(validateObjectIdParam), diagnosisController.getById);
router.get("/patient/:patientId", validateParams(validateObjectIdParam), diagnosisController.getByPatientId);
router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateDiagnosis),
  diagnosisController.update,
);

export default router;