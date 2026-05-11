import express from "express";
import {
  createFullHistoryGrant,
  revokeAccessGrant,
  getMyGrantedAccess,
  getPatientVitalsForProvider,
} from "./access_grant_controller.js";

const router = express.Router();

router.post("/patients/:patientId/access-grants/full-history", createFullHistoryGrant);

router.get("/patients/:patientId/access-grants", getMyGrantedAccess);

router.patch("/access-grants/:grantId/revoke", revokeAccessGrant);

router.get("/provider/patients/:patientId/vitals", getPatientVitalsForProvider);

export default router;