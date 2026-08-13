import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
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
  requirePermission("write_clinical_records"),
  validate(createProcedureSchema),
  createProcedureController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("procedures"),
  requirePermission("view_clinical_records"),
  validate(getPatientProceduresParamsSchema, "params"),
  getPatientProceduresController,
);

export default router;