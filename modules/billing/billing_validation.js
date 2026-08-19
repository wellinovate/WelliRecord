import mongoose from "mongoose";
import { z } from "zod";
import { LINE_ITEM_CATEGORY_LIST } from "./invoice_model.js";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(250),
  category: z.enum(LINE_ITEM_CATEGORY_LIST).optional(),
  sourceType: z.enum(["lab_order", "pharmacy_order", "radiology_order", "manual"]).optional(),
  sourceId: objectIdSchema.optional(),
  quantity: z.number().min(0).optional(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).optional(),
});

export const createInvoiceSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),
  lineItems: z.array(lineItemSchema).min(1),
  taxTotal: z.number().min(0).optional(),
  hmoContribution: z.number().min(0).optional(),
  dueDate: z.string().optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["cash", "pos", "bank-transfer", "other"]),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const getInvoicesQuerySchema = z.object({
  status: z.enum(["unpaid", "partially-paid", "paid", "void"]).optional(),
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});
