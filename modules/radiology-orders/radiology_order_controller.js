import {
  createRadiologyOrderService,
  getAllRadiologyOrdersService,
  updateRadiologyOrderStatusService,
  uploadRadiologyImageService,
  publishRadiologyReportService,
} from "./radiology_order_service.js";
import { getRadiologyOrdersQuerySchema } from "./radiology_order_validation.js";

export const createRadiologyOrderController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const result = await createRadiologyOrderService({ payload, authUser: req.user });
    return res.status(201).json({
      success: true,
      message: "Radiology order created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllRadiologyOrdersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = getRadiologyOrdersQuerySchema.parse(req.query);
    const result = await getAllRadiologyOrdersService({ page, limit, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Radiology orders fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateRadiologyOrderStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.validated;
    const result = await updateRadiologyOrderStatusService({ id, status });
    return res.status(200).json({
      success: true,
      message: "Radiology order status updated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadRadiologyImageController = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await uploadRadiologyImageService({
      id,
      file: req.file,
      authUser: req.user,
    });
    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Failed to upload file" : error.message,
    });
  }
};

export const publishRadiologyReportController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.validated;
    const result = await publishRadiologyReportService({ id, payload, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Report published successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
