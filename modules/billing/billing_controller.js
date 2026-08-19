import {
  getCheckoutSuggestionsService,
  createInvoiceService,
  getInvoicesService,
  getMyInvoicesService,
  getInvoiceByIdService,
  recordPaymentService,
  voidInvoiceService,
  sendInvoiceService,
  verifyInvoiceService,
} from "./billing_service.js";
import { getInvoicesQuerySchema } from "./billing_validation.js";

export const verifyInvoiceController = async (req, res, next) => {
  try {
    const { invoiceNumber } = req.params;
    const result = await verifyInvoiceService({ invoiceNumber });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getCheckoutSuggestionsController = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const result = await getCheckoutSuggestionsService({
      patientId,
      authUser: req.user,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const createInvoiceController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const result = await createInvoiceService({ payload, authUser: req.user });
    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getInvoicesController = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = getInvoicesQuerySchema.parse(req.query);
    const result = await getInvoicesService({
      authUser: req.user,
      status,
      page,
      limit,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getMyInvoicesController = async (req, res, next) => {
  try {
    const { status } = getInvoicesQuerySchema.parse(req.query);
    const result = await getMyInvoicesService({
      patientId: req.user?.sub,
      status,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getInvoiceByIdService({ id, authUser: req.user });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const recordPaymentController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.validated;
    const result = await recordPaymentService({ id, payload, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const voidInvoiceController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.validated || {};
    const result = await voidInvoiceService({ id, reason, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Invoice voided",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const sendInvoiceController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await sendInvoiceService({ id, isReminder: false });
    return res.status(200).json({
      success: true,
      message: "Invoice sent",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const sendPaymentReminderController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await sendInvoiceService({ id, isReminder: true });
    return res.status(200).json({
      success: true,
      message: "Reminder sent",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
