import express from "express";
import { vitalController } from "./vital_controller.js";
import {
  validateCreateVital,
  validateUpdateVital,
} from "./vital_validation.js";
import {
  validateBody,
  validateParams,
} from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post(
  "/",
  validateBody(validateCreateVital),
  vitalController.create,
);

router.get(
  "/:id",
  validateParams(validateObjectIdParam),
  vitalController.getById,
);

router.get(
  "/patient/:patientId",
  validateParams(validateObjectIdParam),
  vitalController.getByPatientId,
);

router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateVital),
  vitalController.update,
);

export default router;