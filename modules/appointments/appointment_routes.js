import express from "express";
import {
  createAppointmentController,
  getSlotAvailabilityController,
  getAppointmentsController,
  getAppointmentByIdController,
  updateAppointmentController,
  checkInAppointmentController,
  markAppointmentNoShowController,
} from "./appointment_controller.js";
import { protect } from "../auth/auth_middleware.js";

const router = express.Router();

router.post("/", protect, createAppointmentController);
router.get("/availability", protect, getSlotAvailabilityController);
router.get("/", protect, getAppointmentsController);
router.get("/:appointmentId", protect, getAppointmentByIdController);
router.patch("/:appointmentId", protect, updateAppointmentController);
router.post("/:appointmentId/check-in", protect, checkInAppointmentController);
router.post("/:appointmentId/no-show", protect, markAppointmentNoShowController);

export default router;