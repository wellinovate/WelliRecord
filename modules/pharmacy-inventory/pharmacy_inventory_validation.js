import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

// ── Products ─────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(250),
  genericName: z.string().trim().max(250).optional(),
  brandName: z.string().trim().max(250).optional(),
  drugClass: z.string().trim().max(150).optional(),
  strength: z.string().trim().max(100).optional(),
  dosageForm: z.string().trim().max(100).optional(),
  packSize: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  countryOfManufacture: z.string().trim().max(100).optional(),
  nafdacNumber: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  sku: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  dispenseStatus: z.enum(["prescription", "otc"]).optional(),
  minimumStock: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  defaultSellingPrice: z.number().min(0).optional(),
  storageRequirement: z.string().trim().max(200).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
  search: z.string().trim().max(200).optional(),
  isActive: z.coerce.boolean().optional(),
});

// ── Suppliers ────────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
  paymentTerms: z.string().trim().max(200).optional(),
  creditLimit: z.number().min(0).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ── Purchase orders ──────────────────────────────────────────────────

const poLineItemInputSchema = z.object({
  productId: objectIdSchema,
  quantityOrdered: z.number().min(1),
  unitCost: z.number().min(0),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: objectIdSchema,
  poNumber: z.string().trim().max(50).optional(),
  lineItems: z.array(poLineItemInputSchema).min(1),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updatePurchaseOrderStatusSchema = z.object({
  status: z.enum(["pending_delivery", "cancelled"]),
});

const receiptLineSchema = z.object({
  productId: objectIdSchema,
  batchNumber: z.string().trim().min(1).max(100),
  quantityReceived: z.number().min(1),
  expiryDate: z.coerce.date(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  location: z.string().trim().max(100).optional(),
});

export const receiveGoodsSchema = z.object({
  receiptLines: z.array(receiptLineSchema).min(1),
});

// ── Batches ──────────────────────────────────────────────────────────

export const listBatchesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
  productId: objectIdSchema.optional(),
  location: z.string().trim().max(100).optional(),
  status: z.enum(["active", "quarantined", "disposed", "returned", "depleted"]).optional(),
  expiringWithinDays: z.coerce.number().min(0).max(3650).optional(),
  expiredOnly: z.coerce.boolean().optional(),
});

// ── Stock adjustments ────────────────────────────────────────────────

export const stockAdjustmentSchema = z.object({
  batchId: objectIdSchema,
  quantityDelta: z.number().refine((v) => v !== 0, { message: "quantityDelta cannot be zero" }),
  reason: z.string().trim().min(3).max(500),
});

// ── Ledger ───────────────────────────────────────────────────────────

export const listLedgerQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
  productId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  transactionType: z
    .enum([
      "opening",
      "purchase",
      "dispense",
      "sale",
      "transfer_out",
      "transfer_in",
      "adjustment",
      "return",
      "disposal",
    ])
    .optional(),
});
