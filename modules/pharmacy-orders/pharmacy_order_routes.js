import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createPharmacyOrderController,
  getAllPharmacyOrdersController,
  updatePharmacyOrderStatusController,
  dispensePharmacyOrderController,
} from "./pharmacy_order_controller.js";
import {
  createPharmacyOrderSchema,
  updatePharmacyOrderStatusSchema,
  dispensePharmacyOrderSchema,
} from "./pharmacy_order_validation.js";

const router = express.Router();

router.get(
  "/",
  protect,
  restrictClinicalScope("pharmacy-orders"),
  getAllPharmacyOrdersController,
);

router.post(
  "/",
  protect,
  restrictClinicalScope("pharmacy-orders"),
  validate(createPharmacyOrderSchema),
  createPharmacyOrderController,
);

router.patch(
  "/:id/status",
  protect,
  restrictClinicalScope("pharmacy-orders"),
  validate(updatePharmacyOrderStatusSchema),
  updatePharmacyOrderStatusController,
);

router.patch(
  "/:id/dispense",
  protect,
  restrictClinicalScope("pharmacy-orders"),
  validate(dispensePharmacyOrderSchema),
  dispensePharmacyOrderController,
);

export default router;
