import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createMedicationController,
  getAllPatientMedicationsController,
  getPatientMedicationsController,
} from "./medication_controller.js";
import {
  createMedicationSchema,
  getPatientMedicationsParamsSchema,
} from "./medications_validator.js";

const router = express.Router();

router.post(
  "/",
  protect,
  validate(createMedicationSchema),
  createMedicationController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientMedicationsParamsSchema, "params"),
  getPatientMedicationsController,
); 

router.get(
  "/patients",
  protect,
  getAllPatientMedicationsController,
); 

export default router;