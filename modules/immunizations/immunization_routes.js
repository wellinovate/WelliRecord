import express from "express";
import { immunizationController } from "./immunization_controller.js";
import {
  validateCreateImmunization,
  validateUpdateImmunization,
} from "./immunization_validation.js";
import { validateBody, validateParams } from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post("/", validateBody(validateCreateImmunization), immunizationController.create);
router.get("/:id", validateParams(validateObjectIdParam), immunizationController.getById);
router.get("/patient/:patientId", validateParams(validateObjectIdParam), immunizationController.getByPatientId);
router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateImmunization),
  immunizationController.update,
);

export default router;