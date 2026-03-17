import express from "express";
import { medicationController } from "./medication_controller.js";
import {
  validateCreateMedication,
  validateUpdateMedication,
} from "./medications_validator.js";
import {
  validateBody,
  validateParams,
} from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post(
  "/",
  validateBody(validateCreateMedication),
  medicationController.create,
);

router.get(
  "/:id",
  validateParams(validateObjectIdParam),
  medicationController.getById,
);

router.get(
  "/patient/:patientId",
  validateParams(validateObjectIdParam),
  medicationController.getByPatientId,
);

router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateMedication),
  medicationController.update,
);

export default router;
