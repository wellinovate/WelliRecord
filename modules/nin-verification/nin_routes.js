import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../auth/auth_middleware.js";
import { ninStatusController, ninVerifyController } from "./nin_controller.js";

const router = express.Router();

// Each lookup costs money, so the route is limited on top of the per-account daily limit in the service.
const ninLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Try again later." },
});

router.get("/nin/status", protect, ninStatusController);
router.post("/nin", protect, ninLimiter, ninVerifyController);

export default router;
