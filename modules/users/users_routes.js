import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { getMyVitalsController } from "../vitals/vital_controller.js";
import * as medicalHistoryController from "./users_controller.js";
import { getMyMedicationsController } from "../medications/medication_controller.js";
import { getMyAllergiesController } from "../allergies/allergies_controller.js";
import { getMyEncounterDetailController, getMyEncountersController } from "../encounter/encounter_controller.js";
import { getMyDiagnosesController } from "../diagnoses/diagnoses_controller.js";
import { getMyLabResultsController } from "../lab/lab_result_controller.js";
import { getMyImmunizationsController } from "../immunizations/immunization_controller.js";
import { getMyProceduresController } from "../procedure/procedure_controller.js";

const router = express.Router();

router.get(
  "/medical-history/summary",
  protect,
  medicalHistoryController.getMedicalHistorySummary,
);
router.get("/medical-history/vitals", protect, getMyVitalsController);
router.get("/medical-history/medications", protect, getMyMedicationsController);
router.get("/medical-history/allergies", protect, getMyAllergiesController);
router.get("/medical-history/diagnoses", protect, getMyDiagnosesController);
router.get("/medical-history/lab", protect, getMyLabResultsController);
router.get("/medical-history/immunizations", protect, getMyImmunizationsController);
router.get("/medical-history/procedures", protect, getMyProceduresController);
router.get("/medical-history/encounter", protect, getMyEncountersController);
router.get("/medical-history/encounter/:id", protect, getMyEncounterDetailController);

router.get("/me", protect, medicalHistoryController.fetchUserProfile);

router.get(
  "/patients/:patientId/medical-history/vitals",
  protect,
  medicalHistoryController.getPatientVitals,
);

router.get(
  "/patients/:patientId/medical-history/diagnoses",
  protect,
  medicalHistoryController.getPatientDiagnoses,
);

// router.get(
//   "/medical-history/medications",
//   protect,
//   medicalHistoryController.getPatientMedications,
// );

router.get(
  "/patients/:patientId/medical-history/procedures",
  protect,
  medicalHistoryController.getPatientProcedures,
);

router.get(
  "/patients/:patientId/medical-history/immunizations",
  protect,
  medicalHistoryController.getPatientImmunizations,
);

router.get(
  "/patients/:patientId/medical-history/lab-results",
  protect,
  medicalHistoryController.getPatientLabResults,
);

router.get(
  "/patients/:patientId/medical-history/allergies",
  protect,
  medicalHistoryController.getPatientAllergies,
);

export default router;
