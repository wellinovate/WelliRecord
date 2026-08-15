import express from "express";
import {
  createAccessGrant,
  getMyGrantedAccess,
  getMyGrantedAccessAsProvider,
  getPatientVitalsForProvider,
  revokeAccessGrant
} from "./access_grant_controller.js";
import { createShareLinkController } from "./bridge_controller.js";
import { protect } from "../auth/auth_middleware.js";

const router = express.Router();

router.use(protect);

router.post("/patients/:patientId/access-grants", createAccessGrant);

router.post("/patients/:patientId/access-grants/share-link", createShareLinkController);

router.get("/patients/:patientId/access-grants", getMyGrantedAccess);

// Provider-side: grants where the current provider (or their org) is
// the grantee, not the patient. Distinct from the route above, which
// is patient-side (grants the patient themself issued).
router.get("/organization/me", getMyGrantedAccessAsProvider);

router.patch("/:grantId/revoke", revokeAccessGrant);

router.get("/provider/patients/:patientId/vitals", getPatientVitalsForProvider);
export default router;