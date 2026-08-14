import {
  createProductService,
  listProductsService,
  getProductByIdService,
  updateProductService,
  createSupplierService,
  listSuppliersService,
  updateSupplierService,
  createPurchaseOrderService,
  listPurchaseOrdersService,
  updatePurchaseOrderStatusService,
  receiveGoodsService,
  listBatchesService,
  createStockAdjustmentService,
  listLedgerService,
  getInventorySummaryService,
} from "./pharmacy_inventory_service.js";
import {
  listProductsQuerySchema,
  listBatchesQuerySchema,
  listLedgerQuerySchema,
} from "./pharmacy_inventory_validation.js";

const respond = (res, status, message, data) =>
  res.status(status).json({ success: true, message, data });

// ── Products ─────────────────────────────────────────────────────────

export const createProductController = async (req, res, next) => {
  try {
    const result = await createProductService({ payload: req.validated, authUser: req.user });
    return respond(res, 201, "Product created", result);
  } catch (error) {
    next(error);
  }
};

export const listProductsController = async (req, res, next) => {
  try {
    const query = listProductsQuerySchema.parse(req.query);
    const result = await listProductsService({ ...query, authUser: req.user });
    return respond(res, 200, "Products fetched", result);
  } catch (error) {
    next(error);
  }
};

export const getProductController = async (req, res, next) => {
  try {
    const result = await getProductByIdService({ id: req.params.id, authUser: req.user });
    return respond(res, 200, "Product fetched", result);
  } catch (error) {
    next(error);
  }
};

export const updateProductController = async (req, res, next) => {
  try {
    const result = await updateProductService({
      id: req.params.id,
      payload: req.validated,
      authUser: req.user,
    });
    return respond(res, 200, "Product updated", result);
  } catch (error) {
    next(error);
  }
};

// ── Suppliers ────────────────────────────────────────────────────────

export const createSupplierController = async (req, res, next) => {
  try {
    const result = await createSupplierService({ payload: req.validated, authUser: req.user });
    return respond(res, 201, "Supplier created", result);
  } catch (error) {
    next(error);
  }
};

export const listSuppliersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, isActive } = req.query;
    const result = await listSuppliersService({
      page: Number(page),
      limit: Number(limit),
      isActive: isActive === undefined ? undefined : isActive === "true",
      authUser: req.user,
    });
    return respond(res, 200, "Suppliers fetched", result);
  } catch (error) {
    next(error);
  }
};

export const updateSupplierController = async (req, res, next) => {
  try {
    const result = await updateSupplierService({
      id: req.params.id,
      payload: req.validated,
      authUser: req.user,
    });
    return respond(res, 200, "Supplier updated", result);
  } catch (error) {
    next(error);
  }
};

// ── Purchase orders ──────────────────────────────────────────────────

export const createPurchaseOrderController = async (req, res, next) => {
  try {
    const result = await createPurchaseOrderService({ payload: req.validated, authUser: req.user });
    return respond(res, 201, "Purchase order created", result);
  } catch (error) {
    next(error);
  }
};

export const listPurchaseOrdersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const result = await listPurchaseOrdersService({
      page: Number(page),
      limit: Number(limit),
      status,
      authUser: req.user,
    });
    return respond(res, 200, "Purchase orders fetched", result);
  } catch (error) {
    next(error);
  }
};

export const updatePurchaseOrderStatusController = async (req, res, next) => {
  try {
    const result = await updatePurchaseOrderStatusService({
      id: req.params.id,
      status: req.validated.status,
      authUser: req.user,
    });
    return respond(res, 200, "Purchase order status updated", result);
  } catch (error) {
    next(error);
  }
};

export const receiveGoodsController = async (req, res, next) => {
  try {
    const result = await receiveGoodsService({
      id: req.params.id,
      receiptLines: req.validated.receiptLines,
      authUser: req.user,
    });
    return respond(res, 200, "Goods received", result);
  } catch (error) {
    next(error);
  }
};

// ── Batches ──────────────────────────────────────────────────────────

export const listBatchesController = async (req, res, next) => {
  try {
    const query = listBatchesQuerySchema.parse(req.query);
    const result = await listBatchesService({ ...query, authUser: req.user });
    return respond(res, 200, "Batches fetched", result);
  } catch (error) {
    next(error);
  }
};

// ── Stock adjustments ────────────────────────────────────────────────

export const createStockAdjustmentController = async (req, res, next) => {
  try {
    const result = await createStockAdjustmentService({ payload: req.validated, authUser: req.user });
    return respond(res, 201, "Stock adjustment recorded", result);
  } catch (error) {
    next(error);
  }
};

// ── Ledger ───────────────────────────────────────────────────────────

export const listLedgerController = async (req, res, next) => {
  try {
    const query = listLedgerQuerySchema.parse(req.query);
    const result = await listLedgerService({ ...query, authUser: req.user });
    return respond(res, 200, "Ledger entries fetched", result);
  } catch (error) {
    next(error);
  }
};

// ── Summary ──────────────────────────────────────────────────────────

export const getInventorySummaryController = async (req, res, next) => {
  try {
    const result = await getInventorySummaryService({ authUser: req.user });
    return respond(res, 200, "Inventory summary fetched", result);
  } catch (error) {
    next(error);
  }
};
