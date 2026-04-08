import express from "express";

import multer from "multer";
import { registerPatientController } from "./organizatons_controller.js";
import { getPatientDetailController, getPatientsController, linkPatientToOrganizationController, searchPatientForOrganizationController } from "./patient/patient_controller.js";
import { protect } from "../auth/auth_middleware.js";
import { linkPatientSchema, searchPatientSchema, validate } from "./patient/patient_validator.js";
// import { protect } from "../auth/auth_middleware;

const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/register-patient", protect, registerPatientController);
router.get("/patients", protect, getPatientsController);
router.get("/patients/:patientId", protect, getPatientDetailController);

router.post(
  "/patient/search",
  protect,
  validate(searchPatientSchema),
  searchPatientForOrganizationController,
);

router.post(
  "/patient/link",
  protect,
  validate(linkPatientSchema),
  linkPatientToOrganizationController,
);

export default router;
