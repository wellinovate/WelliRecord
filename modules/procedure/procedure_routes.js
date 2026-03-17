import express from "express";
import { procedureController } from "./procedure_controller.js";
import {
  validateCreateProcedure,
  validateUpdateProcedure,
} from "./procedure_validation.js";
import { validateBody, validateParams } from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";

const router = express.Router();

router.post("/", validateBody(validateCreateProcedure), procedureController.create);
router.get("/:id", validateParams(validateObjectIdParam), procedureController.getById);
router.get("/patient/:patientId", validateParams(validateObjectIdParam), procedureController.getByPatientId);
router.patch(
  "/:id",
  validateParams(validateObjectIdParam),
  validateBody(validateUpdateProcedure),
  procedureController.update,
);

export default router;