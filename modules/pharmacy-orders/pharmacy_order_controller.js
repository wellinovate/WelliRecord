import {
  createPharmacyOrderService,
  getAllPharmacyOrdersService,
  updatePharmacyOrderStatusService,
  dispensePharmacyOrderService,
} from "./pharmacy_order_service.js";
import { getPharmacyOrdersQuerySchema } from "./pharmacy_order_validation.js";

export const createPharmacyOrderController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const result = await createPharmacyOrderService({ payload, authUser: req.user });
    return res.status(201).json({
      success: true,
      message: "Pharmacy order created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPharmacyOrdersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = getPharmacyOrdersQuerySchema.parse(req.query);
    const result = await getAllPharmacyOrdersService({ page, limit, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Pharmacy orders fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePharmacyOrderStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.validated;
    const result = await updatePharmacyOrderStatusService({ id, status });
    return res.status(200).json({
      success: true,
      message: "Pharmacy order status updated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const dispensePharmacyOrderController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.validated;
    const result = await dispensePharmacyOrderService({ id, payload });
    return res.status(200).json({
      success: true,
      message: "Pharmacy order dispensed",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
