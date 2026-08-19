import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  getCheckoutSuggestionsController,
  createInvoiceController,
  getInvoicesController,
  getMyInvoicesController,
  getInvoiceByIdController,
  recordPaymentController,
  voidInvoiceController,
  sendInvoiceController,
  sendPaymentReminderController,
  verifyInvoiceController,
} from "./billing_controller.js";
import {
  createInvoiceSchema,
  recordPaymentSchema,
  voidInvoiceSchema,
} from "./billing_validation.js";

const router = express.Router();

// Public — no auth. This is what a scanned invoice QR code hits.
router.get("/invoices/verify/:invoiceNumber", verifyInvoiceController);

// Patient's own invoices — must come before "/:id" so "/my" doesn't get
// swallowed as an id param.
router.get("/invoices/my", protect, getMyInvoicesController);

router.get(
  "/checkout-suggestions/:patientId",
  protect,
  requirePermission("create_invoices"),
  getCheckoutSuggestionsController,
);

router.post(
  "/invoices",
  protect,
  requirePermission("create_invoices"),
  validate(createInvoiceSchema),
  createInvoiceController,
);

router.get(
  "/invoices",
  protect,
  requirePermission("view_invoices"),
  getInvoicesController,
);

router.get("/invoices/:id", protect, getInvoiceByIdController);

router.post(
  "/invoices/:id/payments",
  protect,
  requirePermission("manage_payments"),
  validate(recordPaymentSchema),
  recordPaymentController,
);

router.patch(
  "/invoices/:id/void",
  protect,
  requirePermission("manage_payments"),
  validate(voidInvoiceSchema),
  voidInvoiceController,
);

router.post(
  "/invoices/:id/send",
  protect,
  requirePermission("view_invoices"),
  sendInvoiceController,
);

router.post(
  "/invoices/:id/remind",
  protect,
  requirePermission("view_invoices"),
  sendPaymentReminderController,
);

export default router;
