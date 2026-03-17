import express from "express";
import { allergyController } from "./allergies_controller.js";
import {
  validateCreateAllergy,
  validateUpdateAllergy,
} from "./allergies_validation.js";
import { validateBody, validateParams } from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post("/", validateBody(validateCreateAllergy), allergyController.create);
router.get("/:id", validateParams(validateObjectIdParam), allergyController.getById);
router.get("/patient/:patientId", validateParams(validateObjectIdParam), allergyController.getByPatientId);
router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateAllergy),
  allergyController.update,
);

export default router;