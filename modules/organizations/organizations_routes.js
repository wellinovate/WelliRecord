import express from "express";

import {
  registerPatientController,
  searchProvidersController,
  uploadVerificationDocumentController,
  getVerificationStatusController,
  getMyOrganizationController,
  searchNearbyOrganizationsController,
  uploadOrganizationLogoController,
  removeOrganizationLogoController,
} from "./organizatons_controller.js";
import { getPatientDetailController, getPatientsController, linkPatientToOrganizationController, searchPatientForOrganizationController } from "./patient/patient_controller.js";
import { protect } from "../auth/auth_middleware.js";
import { requireOrgVerified } from "./require_org_verified_middleware.js";
import { addDoctorSchema, linkPatientSchema, searchPatientSchema, validate } from "./patient/patient_validator.js";
import { getUserEncounterDetailControllerByOrganization } from "../encounter/encounter_controller.js";
import { addDoctorToOrganizationController, getDoctorsController, searchDoctorForOrganizationController } from "../memberships/membership_controller.js";
import { createUpload, DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES } from "../../shared/middlewares/upload.js";
// import { protect } from "../auth/auth_middleware;

const documentUpload = createUpload({ maxSizeMB: 15, allowedMimeTypes: DOCUMENT_MIME_TYPES, maxFiles: 1 });
const logoUpload = createUpload({ maxSizeMB: 5, allowedMimeTypes: IMAGE_MIME_TYPES, maxFiles: 1 });
const router = express.Router();

router.post(
  "/verify-org/document",
  protect,
  documentUpload.single("document"),
  uploadVerificationDocumentController,
);
router.get("/verify-org/status", protect, getVerificationStatusController);
router.get("/me", protect, getMyOrganizationController);

router.post(
  "/logo",
  protect,
  logoUpload.single("logo"),
  uploadOrganizationLogoController,
);
router.delete("/logo", protect, removeOrganizationLogoController);

router.post("/register-patient", protect, requireOrgVerified, registerPatientController);
router.get("/patients", protect, requireOrgVerified, getPatientsController);
router.get("/memberships/doctors", protect, requireOrgVerified, getDoctorsController);
router.get("/patients/:patientId", protect, requireOrgVerified, getPatientDetailController);

router.get("/search", searchProvidersController);
router.get("/nearby", searchNearbyOrganizationsController);

router.post(
  "/patient/search",
  protect,
  requireOrgVerified,
  validate(searchPatientSchema),
  searchPatientForOrganizationController,
);

router.post(
  "/doctor/search",
  protect,
  requireOrgVerified,
  validate(searchPatientSchema),
  searchDoctorForOrganizationController,
);
router.get("/medical-history/encounter/:id/:patientId", protect, requireOrgVerified, getUserEncounterDetailControllerByOrganization);

router.post(
  "/patient/link",
  protect,
  requireOrgVerified,
  validate(linkPatientSchema),
  linkPatientToOrganizationController,
);
router.post(
  "/doctor/add",
  protect,
  requireOrgVerified,
  validate(addDoctorSchema),
  addDoctorToOrganizationController,
);

export default router;
