import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { getMyVitalsController } from "../vitals/vital_controller.js";
import * as medicalHistoryController from "./users_controller.js";
import { getMyMedicationsController } from "../medications/medication_controller.js";
import { getMyAllergiesController } from "../allergies/allergies_controller.js";
import { getMyEncounterDetailController, getMyEncountersController } from "../encounter/encounter_controller.js";

const router = express.Router();

router.get(
  "/medical-history/summary",
  protect,
  medicalHistoryController.getMedicalHistorySummary,
);
router.get("/medical-history/vitals", protect, getMyVitalsController);
router.get("/medical-history/medications", protect, getMyMedicationsController);
router.get("/medical-history/allergies", protect, getMyAllergiesController);
router.get("/medical-history/encounter", protect, getMyEncountersController);
router.get("/medical-history/encounter/:id", protect, getMyEncounterDetailController);

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
