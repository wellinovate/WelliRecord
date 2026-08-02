import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createProcedureController,
  getPatientProceduresController,
} from "./procedure_controller.js";
import {
  createProcedureSchema,
  getPatientProceduresParamsSchema,
} from "./procedure_validation.js";

const router = express.Router();

router.post(
  "/",
  protect,
  restrictClinicalScope("procedures"),
  validate(createProcedureSchema),
  createProcedureController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("procedures"),
  validate(getPatientProceduresParamsSchema, "params"),
  getPatientProceduresController,
);

export default router;