import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createProductController,
  listProductsController,
  getProductController,
  updateProductController,
  createSupplierController,
  listSuppliersController,
  updateSupplierController,
  createPurchaseOrderController,
  listPurchaseOrdersController,
  updatePurchaseOrderStatusController,
  receiveGoodsController,
  listBatchesController,
  createStockAdjustmentController,
  listLedgerController,
  getInventorySummaryController,
} from "./pharmacy_inventory_controller.js";
import {
  createProductSchema,
  updateProductSchema,
  createSupplierSchema,
  updateSupplierSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderStatusSchema,
  receiveGoodsSchema,
  stockAdjustmentSchema,
} from "./pharmacy_inventory_validation.js";

const router = express.Router();

const view = [protect, restrictClinicalScope("pharmacy-inventory"), requirePermission("view_pharmacy_inventory")];
const manageInventory = [
  protect,
  restrictClinicalScope("pharmacy-inventory"),
  requirePermission("manage_pharmacy_inventory"),
];
const managePurchasing = [
  protect,
  restrictClinicalScope("pharmacy-inventory"),
  requirePermission("manage_pharmacy_purchasing"),
];

// ── Summary ──────────────────────────────────────────────────────────
router.get("/summary", ...view, getInventorySummaryController);

// ── Products ─────────────────────────────────────────────────────────
router.get("/products", ...view, listProductsController);
router.get("/products/:id", ...view, getProductController);
router.post("/products", ...manageInventory, validate(createProductSchema), createProductController);
router.patch("/products/:id", ...manageInventory, validate(updateProductSchema), updateProductController);

// ── Batches ──────────────────────────────────────────────────────────
router.get("/batches", ...view, listBatchesController);

// ── Stock adjustments ────────────────────────────────────────────────
router.post(
  "/adjustments",
  ...manageInventory,
  validate(stockAdjustmentSchema),
  createStockAdjustmentController,
);

// ── Ledger ───────────────────────────────────────────────────────────
router.get("/ledger", ...view, listLedgerController);

// ── Suppliers ────────────────────────────────────────────────────────
router.get("/suppliers", ...view, listSuppliersController);
router.post("/suppliers", ...manageInventory, validate(createSupplierSchema), createSupplierController);
router.patch("/suppliers/:id", ...manageInventory, validate(updateSupplierSchema), updateSupplierController);

// ── Purchase orders ──────────────────────────────────────────────────
router.get("/purchase-orders", ...view, listPurchaseOrdersController);
router.post(
  "/purchase-orders",
  ...managePurchasing,
  validate(createPurchaseOrderSchema),
  createPurchaseOrderController,
);
router.patch(
  "/purchase-orders/:id/status",
  ...managePurchasing,
  validate(updatePurchaseOrderStatusSchema),
  updatePurchaseOrderStatusController,
);
router.patch(
  "/purchase-orders/:id/receive",
  ...managePurchasing,
  validate(receiveGoodsSchema),
  receiveGoodsController,
);

export default router;
