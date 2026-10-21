import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../auth/auth_middleware.js";
import { joinTokenService } from "./telehealth_service.js";

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post("/appointments/:appointmentId/token", protect, limiter, async (req, res, next) => {
  try {
    const data = await joinTokenService({ appointmentId: req.params.appointmentId, authUser: req.user });
    res.json({ success: true, data });
  } catch (e) {
    if (e.opensAt) return res.status(e.statusCode || 425).json({ success: false, message: e.message, code: e.code, opensAt: e.opensAt });
    next(e);
  }
});

export default router;
