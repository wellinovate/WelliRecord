import mongoose from "mongoose";
import { z } from "zod";
import { LAB_ORDER_WORKFLOW_STAGES } from "./lab_order_model.js";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createLabOrderSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  testName: z.string().trim().min(1).max(250),
  category: z
    .enum([
      "hematology",
      "chemistry",
      "microbiology",
      "serology",
      "urinalysis",
      "pathology",
      "other",
    ])
    .optional(),

  priority: z.enum(["routine", "urgent", "home-sample"]).optional(),
  sampleType: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),

  doctorName: z.string().trim().max(200).optional(),
  doctorPhone: z.string().trim().max(30).optional(),
  collector: z.string().trim().max(200).optional(),

  price: z.number().min(0).optional(),
  paymentStatus: z.enum(["paid", "pending"]).optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const updateLabOrderStatusSchema = z.object({
  status: z.enum(LAB_ORDER_WORKFLOW_STAGES),
});

export const enterLabOrderResultSchema = z.object({
  measuredValue: z.string().trim().max(500).optional(),
  normalRange: z.string().trim().max(200).optional(),
  interpretation: z.string().trim().max(500).optional(),
  isCritical: z.boolean().optional(),
  verifiedBy: z.string().trim().max(200).optional(),
});

export const getLabOrdersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});
