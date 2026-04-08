import express from "express";
import { protect } from "../auth/auth_middleware.js";
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
  validate(createLabResultSchema),
  createLabResultController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientLabResultsParamsSchema, "params"),
  getPatientLabResultsController,
);
router.get(
  "/patients",
  protect,
  getAllPatientLabResultsController,
);

export default router;