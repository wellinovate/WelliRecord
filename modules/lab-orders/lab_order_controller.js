import {
  createLabOrderService,
  getAllLabOrdersService,
  updateLabOrderStatusService,
  enterLabOrderResultService,
  previewLabOrderResultService,
  verifyLabOrderResultService,
} from "./lab_order_service.js";
import { getLabOrdersQuerySchema } from "./lab_order_validation.js";

export const createLabOrderController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const result = await createLabOrderService({ payload, authUser: req.user });
    return res.status(201).json({
      success: true,
      message: "Lab order created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllLabOrdersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = getLabOrdersQuerySchema.parse(req.query);
    const result = await getAllLabOrdersService({ page, limit, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Lab orders fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLabOrderStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.validated;
    const result = await updateLabOrderStatusService({ id, status, reason, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Lab order status updated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const enterLabOrderResultController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.validated;
    const result = await enterLabOrderResultService({ id, payload, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Lab order result saved",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyLabOrderResultController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await verifyLabOrderResultService({ id, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Lab result verified",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const previewLabOrderResultController = async (req, res, next) => {
  try {
    const data = await previewLabOrderResultService({ id: req.params.id, payload: req.validated, authUser: req.user });
    return res.status(200).json({ success: true, message: "Result preview", data });
  } catch (error) {
    next(error);
  }
};
