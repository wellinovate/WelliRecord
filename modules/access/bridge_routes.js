import express from "express";
import { getSharedRecordController } from "./bridge_controller.js";

const router = express.Router();

// Deliberately public — no `protect` middleware. This is the WelliBridge
// "Temporary Provider Portal": any doctor with the share link or QR code
// can view exactly the scoped, time-limited data the patient chose to
// share, without a WelliRecord account or login. Access control lives in
// the opaque, unguessable shareToken itself (resolveBridgeAccess in
// bridge_service.js), not in a session.
router.get("/:token", getSharedRecordController);

export default router;
