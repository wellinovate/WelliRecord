import express from "express";
import {
  createAppointmentController,
  getAppointmentsController,
  getAppointmentByIdController,
  updateAppointmentController,
  checkInAppointmentController,
  markAppointmentNoShowController,
} from "./appointment_controller.js";

const router = express.Router();

router.post("/", createAppointmentController);
router.get("/", getAppointmentsController);
router.get("/:appointmentId", getAppointmentByIdController);
router.patch("/:appointmentId", updateAppointmentController);
router.post("/:appointmentId/check-in", checkInAppointmentController);
router.post("/:appointmentId/no-show", markAppointmentNoShowController);

export default router;