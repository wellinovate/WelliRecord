import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../auth/auth_middleware.js";
import * as c from "./record_link_controller.js";

const router = express.Router();

const limit = (max, windowMs = 15 * 60 * 1000) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, message: "Too many requests. Try again later." }),
  });

// Patient side. The token comes from the hospital's link.
router.get("/claim/:token", limit(30), c.claimInfo);
router.post("/claim/:token/otp", limit(10), protect, c.otpSend);
router.post("/claim/:token/verify", limit(20), protect, c.otpVerify);
router.post("/claim/:token/consent", limit(20), protect, c.consent);
router.get("/mine", protect, c.mine);
router.post("/mine/:id/withdraw", protect, c.withdraw);

// Hospital staff side. Every handler resolves the caller's organization and scopes to it.
router.post("/", protect, limit(60, 60 * 1000), c.initiate);
router.get("/", protect, c.list);
router.get("/:id", protect, c.detail);
router.post("/:id/items", protect, c.stage);
router.post("/:id/approve", protect, limit(30, 60 * 1000), c.approve);
router.post("/:id/reject", protect, c.reject);
router.post("/:id/reopen", protect, c.reopen);
router.post("/:id/cancel", protect, c.cancel);

export default router;
