import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createLabOrderController,
  getAllLabOrdersController,
  updateLabOrderStatusController,
  enterLabOrderResultController,
} from "./lab_order_controller.js";
import {
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  enterLabOrderResultSchema,
} from "./lab_order_validation.js";

const router = express.Router();

router.get(
  "/",
  protect,
  restrictClinicalScope("lab-orders"),
  getAllLabOrdersController,
);

router.post(
  "/",
  protect,
  restrictClinicalScope("lab-orders"),
  validate(createLabOrderSchema),
  createLabOrderController,
);

router.patch(
  "/:id/status",
  protect,
  restrictClinicalScope("lab-orders"),
  validate(updateLabOrderStatusSchema),
  updateLabOrderStatusController,
);

router.patch(
  "/:id/result",
  protect,
  restrictClinicalScope("lab-orders"),
  validate(enterLabOrderResultSchema),
  enterLabOrderResultController,
);

export default router;
