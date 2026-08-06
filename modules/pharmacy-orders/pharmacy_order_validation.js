import mongoose from "mongoose";
import { z } from "zod";
import { PHARMACY_ORDER_WORKFLOW_STAGES } from "./pharmacy_order_model.js";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createPharmacyOrderSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  medicationName: z.string().trim().min(1).max(250),
  dosage: z.string().trim().max(100).optional(),
  quantity: z.number().min(1).optional(),
  instructions: z.string().trim().max(500).optional(),

  priority: z.enum(["routine", "urgent"]).optional(),
  barcode: z.string().trim().max(100).optional(),

  prescribedByName: z.string().trim().max(200).optional(),
  prescribedByPhone: z.string().trim().max(30).optional(),

  price: z.number().min(0).optional(),
  paymentStatus: z.enum(["paid", "pending"]).optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const updatePharmacyOrderStatusSchema = z.object({
  status: z.enum(PHARMACY_ORDER_WORKFLOW_STAGES),
});

export const dispensePharmacyOrderSchema = z.object({
  dispensedBy: z.string().trim().max(200).optional(),
});

export const getPharmacyOrdersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});
