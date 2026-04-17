import express from "express";
import {
  createAppointmentController,
  getAppointmentsController,
  getAppointmentByIdController,
  updateAppointmentController,
  checkInAppointmentController,
  markAppointmentNoShowController,
} from "./appointment_controller.js";
import { protect } from "../auth/auth_middleware.js";

const router = express.Router();

router.post("/", protect, createAppointmentController);
router.get("/", getAppointmentsController);
router.get("/:appointmentId", protect, getAppointmentByIdController);
router.patch("/:appointmentId", protect, updateAppointmentController);
router.post("/:appointmentId/check-in", protect, checkInAppointmentController);
router.post("/:appointmentId/no-show", protect, markAppointmentNoShowController);

export default router;