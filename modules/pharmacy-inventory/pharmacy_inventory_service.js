import mongoose from "mongoose";
import { pharmacyProductModel } from "./pharmacy_product_model.js";
import { pharmacyBatchModel } from "./pharmacy_batch_model.js";
import { pharmacyStockLedgerModel } from "./pharmacy_stock_ledger_model.js";
import { pharmacySupplierModel } from "./pharmacy_supplier_model.js";
import { pharmacyPurchaseOrderModel } from "./pharmacy_purchase_order_model.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { getIO } from "../../shared/realtime/socket.js";

// ── Organization context ────────────────────────────────────────────
// Inventory is facility-owned, not patient-owned — every read and
// write here is scoped to the acting staff member's organization, the
// same organizationId resolveActorContext already computes correctly
// for both the org owner account and staff accounts (see the bugfix
// note in vital_service.js this reuses rather than re-deriving).
const requireOrganizationContext = async (authUser) => {
  const actor = await resolveActorContext(authUser);

  if (!actor.isOrganizationActor || !actor.organizationId) {
    const error = new Error("This action requires a provider/facility account");
    error.statusCode = 403;
    throw error;
  }

  return actor;
};

const broadcast = (organizationId, type, payload) => {
  const io = getIO();
  if (!io) return;
  io.to(`org:${organizationId}`).emit("pharmacy_inventory_change", {
    type,
    ...payload,
  });
};

// ── Serializers ──────────────────────────────────────────────────────

const serializeProduct = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  name: item.name,
  genericName: item.genericName,
  brandName: item.brandName,
  drugClass: item.drugClass,
  strength: item.strength,
  dosageForm: item.dosageForm,
  packSize: item.packSize,
  manufacturer: item.manufacturer,
  countryOfManufacture: item.countryOfManufacture,
  nafdacNumber: item.nafdacNumber,
  barcode: item.barcode,
  sku: item.sku,
  category: item.category,
  dispenseStatus: item.dispenseStatus,
  minimumStock: item.minimumStock,
  reorderLevel: item.reorderLevel,
  reorderQuantity: item.reorderQuantity,
  defaultSellingPrice: item.defaultSellingPrice,
  storageRequirement: item.storageRequirement,
  isActive: item.isActive,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeBatch = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  productId: item.productId,
  supplierId: item.supplierId,
  purchaseOrderId: item.purchaseOrderId,
  batchNumber: item.batchNumber,
  location: item.location,
  quantityReceived: item.quantityReceived,
  quantityOnHand: item.quantityOnHand,
  costPrice: item.costPrice,
  sellingPrice: item.sellingPrice,
  expiryDate: item.expiryDate,
  receivedAt: item.receivedAt,
  status: item.status,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeLedgerEntry = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  productId: item.productId,
  batchId: item.batchId,
  transactionType: item.transactionType,
  quantityDelta: item.quantityDelta,
  balanceAfter: item.balanceAfter,
  location: item.location,
  referenceType: item.referenceType,
  referenceId: item.referenceId,
  actorId: item.actorId,
  reason: item.reason,
  createdAt: item.createdAt,
});

const serializeSupplier = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  name: item.name,
  contactName: item.contactName,
  phone: item.phone,
  email: item.email,
  address: item.address,
  paymentTerms: item.paymentTerms,
  creditLimit: item.creditLimit,
  notes: item.notes,
  isActive: item.isActive,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializePurchaseOrder = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  supplierId: item.supplierId,
  poNumber: item.poNumber,
  status: item.status,
  lineItems: item.lineItems,
  expectedDeliveryDate: item.expectedDeliveryDate,
  notes: item.notes,
  createdBy: item.createdBy,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

// ── Products ─────────────────────────────────────────────────────────

export const createProductService = async ({ payload, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const product = await pharmacyProductModel.create({
    organizationId: actor.organizationId,
    ...payload,
  });

  return serializeProduct(product);
};

export const listProductsService = async ({ authUser, page = 1, limit = 20, search, isActive }) => {
  const actor = await requireOrganizationContext(authUser);

  const filter = { organizationId: actor.organizationId };
  if (typeof isActive === "boolean") filter.isActive = isActive;
  if (search) filter.$text = { $search: search };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    pharmacyProductModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    pharmacyProductModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeProduct),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getProductByIdService = async ({ id, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const product = await pharmacyProductModel.findOne({
    _id: id,
    organizationId: actor.organizationId,
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return serializeProduct(product);
};

export const updateProductService = async ({ id, payload, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const product = await pharmacyProductModel.findOneAndUpdate(
    { _id: id, organizationId: actor.organizationId },
    payload,
    { new: true, runValidators: true },
  );

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return serializeProduct(product);
};

// ── Suppliers ────────────────────────────────────────────────────────

export const createSupplierService = async ({ payload, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const supplier = await pharmacySupplierModel.create({
    organizationId: actor.organizationId,
    ...payload,
  });

  return serializeSupplier(supplier);
};

export const listSuppliersService = async ({ authUser, page = 1, limit = 20, isActive }) => {
  const actor = await requireOrganizationContext(authUser);

  const filter = { organizationId: actor.organizationId };
  if (typeof isActive === "boolean") filter.isActive = isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    pharmacySupplierModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    pharmacySupplierModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeSupplier),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const updateSupplierService = async ({ id, payload, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const supplier = await pharmacySupplierModel.findOneAndUpdate(
    { _id: id, organizationId: actor.organizationId },
    payload,
    { new: true, runValidators: true },
  );

  if (!supplier) {
    const error = new Error("Supplier not found");
    error.statusCode = 404;
    throw error;
  }

  return serializeSupplier(supplier);
};

// ── Purchase orders ──────────────────────────────────────────────────

const generatePoNumber = () => `PO-${Date.now().toString(36).toUpperCase()}`;

export const createPurchaseOrderService = async ({ payload, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const supplier = await pharmacySupplierModel.findOne({
    _id: payload.supplierId,
    organizationId: actor.organizationId,
  });
  if (!supplier) {
    const error = new Error("Supplier not found");
    error.statusCode = 404;
    throw error;
  }

  const po = await pharmacyPurchaseOrderModel.create({
    organizationId: actor.organizationId,
    supplierId: payload.supplierId,
    poNumber: payload.poNumber || generatePoNumber(),
    status: "draft",
    lineItems: payload.lineItems,
    expectedDeliveryDate: payload.expectedDeliveryDate || null,
    notes: payload.notes || "",
    createdBy: actor.userId,
  });

  return serializePurchaseOrder(po);
};

export const listPurchaseOrdersService = async ({ authUser, page = 1, limit = 20, status }) => {
  const actor = await requireOrganizationContext(authUser);

  const filter = { organizationId: actor.organizationId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    pharmacyPurchaseOrderModel
      .find(filter)
      .populate("supplierId", "name phone email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    pharmacyPurchaseOrderModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializePurchaseOrder),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// Only the transitions that don't imply stock has moved. "received"
// and "partially_received" are set exclusively by receiveGoodsService
// below, never by direct status update — otherwise a status edit could
// claim stock arrived without a single batch or ledger row to back it.
const MANUAL_STATUS_TRANSITIONS = new Set(["pending_delivery", "cancelled"]);

export const updatePurchaseOrderStatusService = async ({ id, status, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  if (!MANUAL_STATUS_TRANSITIONS.has(status)) {
    const error = new Error(
      "This status can only be set by receiving goods against the order, not updated directly",
    );
    error.statusCode = 400;
    throw error;
  }

  const po = await pharmacyPurchaseOrderModel.findOne({
    _id: id,
    organizationId: actor.organizationId,
  });

  if (!po) {
    const error = new Error("Purchase order not found");
    error.statusCode = 404;
    throw error;
  }

  if (po.status === "received" || po.status === "cancelled") {
    const error = new Error(`Cannot change status of a ${po.status} purchase order`);
    error.statusCode = 400;
    throw error;
  }

  po.status = status;
  await po.save();

  return serializePurchaseOrder(po);
};

// Goods receipt is the only place a purchase order is allowed to
// increase inventory. Each receipt line is matched against an existing
// line item on the PO — you cannot receive a product that wasn't
// ordered, and you cannot receive more than what's still outstanding
// on that line.
export const receiveGoodsService = async ({ id, receiptLines, authUser }) => {
  const actor = await requireOrganizationContext(authUser);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const po = await pharmacyPurchaseOrderModel
      .findOne({ _id: id, organizationId: actor.organizationId })
      .session(session);

    if (!po) {
      const error = new Error("Purchase order not found");
      error.statusCode = 404;
      throw error;
    }

    if (po.status === "received" || po.status === "cancelled") {
      const error = new Error(`Cannot receive goods against a ${po.status} purchase order`);
      error.statusCode = 400;
      throw error;
    }

    const touchedBatches = [];

    for (const line of receiptLines) {
      const lineItem = po.lineItems.find(
        (li) => String(li.productId) === String(line.productId),
      );
      if (!lineItem) {
        const error = new Error(
          `Product ${line.productId} is not on this purchase order`,
        );
        error.statusCode = 400;
        throw error;
      }

      const remaining = lineItem.quantityOrdered - lineItem.quantityReceived;
      if (line.quantityReceived > remaining) {
        const error = new Error(
          `Cannot receive ${line.quantityReceived} units — only ${remaining} still outstanding on this order`,
        );
        error.statusCode = 400;
        throw error;
      }

      const location = line.location || "central";

      let batch = await pharmacyBatchModel
        .findOne({
          organizationId: actor.organizationId,
          productId: line.productId,
          batchNumber: line.batchNumber,
          location,
        })
        .session(session);

      if (batch) {
        batch.quantityOnHand += line.quantityReceived;
        batch.quantityReceived += line.quantityReceived;
        await batch.save({ session });
      } else {
        const created = await pharmacyBatchModel.create(
          [
            {
              organizationId: actor.organizationId,
              productId: line.productId,
              supplierId: po.supplierId,
              purchaseOrderId: po._id,
              batchNumber: line.batchNumber,
              location,
              quantityReceived: line.quantityReceived,
              quantityOnHand: line.quantityReceived,
              costPrice: line.costPrice ?? lineItem.unitCost,
              sellingPrice: line.sellingPrice || 0,
              expiryDate: line.expiryDate,
              status: "active",
            },
          ],
          { session },
        );
        batch = created[0];
      }

      await pharmacyStockLedgerModel.create(
        [
          {
            organizationId: actor.organizationId,
            productId: line.productId,
            batchId: batch._id,
            transactionType: "purchase",
            quantityDelta: line.quantityReceived,
            balanceAfter: batch.quantityOnHand,
            location,
            referenceType: "purchase_order",
            referenceId: po._id,
            actorId: actor.userId,
            reason: `Goods receipt against ${po.poNumber}`,
          },
        ],
        { session },
      );

      lineItem.quantityReceived += line.quantityReceived;
      touchedBatches.push(batch);
    }

    const allReceived = po.lineItems.every(
      (li) => li.quantityReceived >= li.quantityOrdered,
    );
    const anyReceived = po.lineItems.some((li) => li.quantityReceived > 0);
    po.status = allReceived ? "received" : anyReceived ? "partially_received" : po.status;

    await po.save({ session });

    await session.commitTransaction();
    session.endSession();

    broadcast(actor.organizationId, "goods_receipt", {
      purchaseOrderId: po._id,
      batchIds: touchedBatches.map((b) => b._id),
    });

    return {
      purchaseOrder: serializePurchaseOrder(po),
      batches: touchedBatches.map(serializeBatch),
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// ── Batches ──────────────────────────────────────────────────────────

export const listBatchesService = async ({
  authUser,
  page = 1,
  limit = 20,
  productId,
  location,
  status,
  expiringWithinDays,
  expiredOnly,
}) => {
  const actor = await requireOrganizationContext(authUser);

  const filter = { organizationId: actor.organizationId };
  if (productId) filter.productId = productId;
  if (location) filter.location = location;
  if (status) filter.status = status;

  const now = new Date();
  if (expiredOnly) {
    filter.expiryDate = { $lt: now };
  } else if (typeof expiringWithinDays === "number") {
    const horizon = new Date(now.getTime() + expiringWithinDays * 24 * 60 * 60 * 1000);
    filter.expiryDate = { $gte: now, $lte: horizon };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    pharmacyBatchModel
      .find(filter)
      .populate("productId", "name genericName")
      .sort({ expiryDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    pharmacyBatchModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeBatch),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ── Stock adjustments ────────────────────────────────────────────────

// A manual correction — the one place outside goods receipt and
// dispensing that quantityOnHand can move, and it always requires a
// reason on the ledger row. Cannot take a batch negative.
export const createStockAdjustmentService = async ({ payload, authUser }) => {
  const actor = await requireOrganizationContext(authUser);
  const { batchId, quantityDelta, reason } = payload;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const batch = await pharmacyBatchModel
      .findOne({ _id: batchId, organizationId: actor.organizationId })
      .session(session);

    if (!batch) {
      const error = new Error("Batch not found");
      error.statusCode = 404;
      throw error;
    }

    const newQuantity = batch.quantityOnHand + quantityDelta;
    if (newQuantity < 0) {
      const error = new Error("Adjustment would take this batch below zero");
      error.statusCode = 400;
      throw error;
    }

    batch.quantityOnHand = newQuantity;
    if (newQuantity === 0 && batch.status === "active") {
      batch.status = "depleted";
    }
    await batch.save({ session });

    const [ledgerEntry] = await pharmacyStockLedgerModel.create(
      [
        {
          organizationId: actor.organizationId,
          productId: batch.productId,
          batchId: batch._id,
          transactionType: "adjustment",
          quantityDelta,
          balanceAfter: newQuantity,
          location: batch.location,
          actorId: actor.userId,
          reason,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    broadcast(actor.organizationId, "adjustment", { batchId: batch._id });

    return {
      batch: serializeBatch(batch),
      ledgerEntry: serializeLedgerEntry(ledgerEntry),
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// ── Ledger ───────────────────────────────────────────────────────────

export const listLedgerService = async ({
  authUser,
  page = 1,
  limit = 50,
  productId,
  batchId,
  transactionType,
}) => {
  const actor = await requireOrganizationContext(authUser);

  const filter = { organizationId: actor.organizationId };
  if (productId) filter.productId = productId;
  if (batchId) filter.batchId = batchId;
  if (transactionType) filter.transactionType = transactionType;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    pharmacyStockLedgerModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    pharmacyStockLedgerModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeLedgerEntry),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ── Summary ──────────────────────────────────────────────────────────

// Backs the inventory snapshot a dashboard would show. Every number
// here is computed from PharmacyProduct/PharmacyBatch at request time
// — nothing is a hardcoded placeholder, unlike the current
// PharmacyDashboard.tsx metrics bar (revenueToday/outstanding are
// literal numbers in the component today).
export const getInventorySummaryService = async ({ authUser }) => {
  const actor = await requireOrganizationContext(authUser);
  const organizationId = actor.organizationId;

  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [products, batchTotals, expiringSoon, expired, valueAgg] = await Promise.all([
    pharmacyProductModel
      .find({ organizationId, isActive: true })
      .select("reorderLevel")
      .lean(),

    pharmacyBatchModel.aggregate([
      { $match: { organizationId, status: "active" } },
      { $group: { _id: "$productId", totalQty: { $sum: "$quantityOnHand" } } },
    ]),

    pharmacyBatchModel.countDocuments({
      organizationId,
      status: "active",
      quantityOnHand: { $gt: 0 },
      expiryDate: { $gte: now, $lte: ninetyDaysFromNow },
    }),

    pharmacyBatchModel.countDocuments({
      organizationId,
      status: "active",
      quantityOnHand: { $gt: 0 },
      expiryDate: { $lt: now },
    }),

    pharmacyBatchModel.aggregate([
      { $match: { organizationId, status: "active" } },
      { $group: { _id: null, value: { $sum: { $multiply: ["$quantityOnHand", "$costPrice"] } } } },
    ]),
  ]);

  const qtyByProduct = new Map(batchTotals.map((b) => [String(b._id), b.totalQty]));

  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;

  for (const product of products) {
    const qty = qtyByProduct.get(String(product._id)) || 0;
    if (qty <= 0) outOfStock += 1;
    else if (qty <= product.reorderLevel) lowStock += 1;
    else inStock += 1;
  }

  return {
    totalProducts: products.length,
    inStock,
    lowStock,
    outOfStock,
    expiringSoon,
    expired,
    stockValue: valueAgg[0]?.value || 0,
  };
};
