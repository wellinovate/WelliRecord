import {
  createAppointmentService,
  getAppointmentsService,
  getAppointmentByIdService,
  updateAppointmentService,
  checkInAppointmentService,
  markAppointmentNoShowService,
} from "./appointment_service.js";

export const createAppointmentController = async (req, res, next) => {
  try {
    const appointment = await createAppointmentService({
      ...req.body,
      createdBy: req.user?.sub || null,
    });

    return res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointmentsController = async (req, res, next) => {
  try {
    const result = await getAppointmentsService(req.query);

    return res.status(200).json({
      success: true,
      message: "Appointments fetched successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointmentByIdController = async (req, res, next) => {
  try {
    const appointment = await getAppointmentByIdService(req.params.appointmentId);

    return res.status(200).json({
      success: true,
      message: "Appointment fetched successfully",
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAppointmentController = async (req, res, next) => {
  try {
    const appointment = await updateAppointmentService(
      req.params.appointmentId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

export const checkInAppointmentController = async (req, res, next) => {
  try {
    const result = await checkInAppointmentService({
      appointmentId: req.params.appointmentId,
      checkedInBy: req.user?.sub || null,
    });

    return res.status(200).json({
      success: true,
      message: "Appointment checked in successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const markAppointmentNoShowController = async (req, res, next) => {
  try {
    const appointment = await markAppointmentNoShowService(
      req.params.appointmentId,
    );

    return res.status(200).json({
      success: true,
      message: "Appointment marked as no-show",
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};