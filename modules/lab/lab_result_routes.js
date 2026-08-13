import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createLabResultController,
  getAllPatientLabResultsController,
  getPatientLabResultsController,
} from "./lab_result_controller.js";
import {
  createLabResultSchema,
  getPatientLabResultsParamsSchema,
} from "./lab_result_validation.js";

const router = express.Router();

router.post(
  "/",
  protect,
  restrictClinicalScope("lab-results"),
  requirePermission("write_lab_results"),
  validate(createLabResultSchema),
  createLabResultController,
);

router.get(
  "/patient/:patientId",
  protect,
  restrictClinicalScope("lab-results"),
  requirePermission("view_lab_orders"),
  validate(getPatientLabResultsParamsSchema, "params"),
  getPatientLabResultsController,
);
router.get(
  "/patients",
  protect,
  restrictClinicalScope("lab-results"),
  requirePermission("view_lab_orders"),
  getAllPatientLabResultsController,
);

export default router;