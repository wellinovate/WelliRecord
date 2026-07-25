import express from "express";
import { protect, requireAdmin } from "../auth/auth_middleware.js";
import { listPlatformUsersController } from "./admin_users_controller.js";

const router = express.Router();

router.get("/users", protect, requireAdmin, listPlatformUsersController);

export default router;
