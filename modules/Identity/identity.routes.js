import express from "express";
import {
  sendEmailVerification,
  confirmEmailVerification,
  getMyIdentity,
} from "./identity.controller.js";

import { authenticate } from "../auth/auth.middleware.js";

const router = express.Router();

/**
 * All routes require authentication
 */
router.use(authenticate);

// GET identity state
router.get("/me", getMyIdentity);

// EMAIL OTP FLOW
router.post("/email/send", sendEmailVerification);
router.post("/email/confirm", confirmEmailVerification);

export default router;