import express from "express";
import { protect } from "../auth/auth_middleware.js";
import {
  createAllergyController,
  getPatientAllergiesController,
} from "./allergies_controller.js";
import {
  createAllergySchema,
  getPatientAllergiesParamsSchema,
} from "./allergies_validation.js";
import { validate } from "../../shared/middlewares/validator.js";

const router = express.Router();

router.post(
  "/",
  protect,
  validate(createAllergySchema),
  createAllergyController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientAllergiesParamsSchema, "params"),
  getPatientAllergiesController,
);

export default router;