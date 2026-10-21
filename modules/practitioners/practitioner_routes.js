import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../auth/auth_middleware.js";
import { becomeController, meController, optionsController, switchController, updateController } from "./practitioner_controller.js";

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.get("/options", optionsController);
router.get("/me", protect, meController);
router.post("/", protect, limiter, becomeController);
router.patch("/me", protect, limiter, updateController);
router.post("/switch", protect, limiter, switchController);

export default router;
