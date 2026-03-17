import express from "express";
import { labResultController } from "./lab_result_controller.js";
import {
  validateCreateLabResult,
  validateUpdateLabResult,
} from "./lab_result_validation.js";
import { validateBody, validateParams } from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post("/", validateBody(validateCreateLabResult), labResultController.create);
router.get("/:id", validateParams(validateObjectIdParam), labResultController.getById);
router.get("/patient/:patientId", validateParams(validateObjectIdParam), labResultController.getByPatientId);
router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateLabResult),
  labResultController.update,
);

export default router;