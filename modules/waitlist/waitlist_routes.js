import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import { joinWaitlistController } from "./waitlist_controller.js";
import { joinWaitlistSchema } from "./waitlist_validation.js";

const router = express.Router();

router.post(
  "/",
  protect,
  validate(joinWaitlistSchema),
  joinWaitlistController,
);

export default router;
