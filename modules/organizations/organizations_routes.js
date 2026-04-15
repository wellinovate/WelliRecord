import express from "express";

import multer from "multer";
import { registerPatientController, searchProvidersController } from "./organizatons_controller.js";
import { getPatientDetailController, getPatientsController, linkPatientToOrganizationController, searchPatientForOrganizationController } from "./patient/patient_controller.js";
import { protect } from "../auth/auth_middleware.js";
import { addDoctorSchema, linkPatientSchema, searchPatientSchema, validate } from "./patient/patient_validator.js";
import { getUserEncounterDetailControllerByOrganization } from "../encounter/encounter_controller.js";
import { addDoctorToOrganizationController, getDoctorsController, searchDoctorForOrganizationController } from "../memberships/membership_controller.js";
// import { protect } from "../auth/auth_middleware;

const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/register-patient", protect, registerPatientController);
router.get("/patients", protect, getPatientsController);
router.get("/memberships/doctors", protect, getDoctorsController);
router.get("/patients/:patientId", protect, getPatientDetailController);

router.get("/search", searchProvidersController);

router.post(
  "/patient/search",
  protect,
  validate(searchPatientSchema),
  searchPatientForOrganizationController,
);

router.post(
  "/doctor/search",
  protect,
  validate(searchPatientSchema),
  searchDoctorForOrganizationController,
);
router.get("/medical-history/encounter/:id/:patientId", protect, getUserEncounterDetailControllerByOrganization);

router.post(
  "/patient/link",
  protect,
  validate(linkPatientSchema),
  linkPatientToOrganizationController,
);
router.post(
  "/doctor/add",
  protect,
  validate(addDoctorSchema),
  addDoctorToOrganizationController,
);

export default router;
