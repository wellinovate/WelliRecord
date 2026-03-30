import express from "express";
import { protect } from "../auth/auth_middleware.js";
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
  validate(createProcedureSchema),
  createProcedureController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientProceduresParamsSchema, "params"),
  getPatientProceduresController,
);

export default router;