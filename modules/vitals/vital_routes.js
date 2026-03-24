import express from "express";
import { createVitalController, getPatientVitalsController } from "./vital_controller.js";
import {
  createVitalSchema,
  getPatientVitalsParamsSchema,
  validateCreateVital,
  validateUpdateVital,
} from "./vital_validation.js";
import {
  validateBody,
  validateParams,
} from "../../shared/libs/validate_middleware.js";
import { validateObjectIdParam } from "../../shared/libs/common_validators.js";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";

const router = express.Router();


// router.get(
//   "/:id",
//   validateParams(validateObjectIdParam),
//   vitalController.getById,
// );

// router.get(
//   "/patient/:patientId",
//   validateParams(validateObjectIdParam),
//   vitalController.getByPatientId,
// );

// router.patch(
//   "/:id",
//   validateParams(validateObjectIdParam),
//   validateBody(validateUpdateVital),
//   vitalController.update,
// );

router.post(
  "/",
  protect,
  // requireOrganizationAccount,
  validate(createVitalSchema),
  createVitalController,
);

router.get(
  "/patient/:patientId",
  protect,
  validate(getPatientVitalsParamsSchema, "params"),
  getPatientVitalsController,
);
router.get(
  "/patient/me",
  protect,
  getPatientVitalsController,
);

export default router;
