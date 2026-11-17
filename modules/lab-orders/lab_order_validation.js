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
  testKey: z.string().trim().max(60).optional(),
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
  reason: z.string().trim().min(1).max(300).optional(),
});

export const enterLabOrderResultSchema = z.object({
  measuredValue: z.string().trim().max(500).optional(),
  normalRange: z.string().trim().max(200).optional(),
  interpretation: z.string().trim().max(500).optional(),
  isCritical: z.boolean().optional(),
  // Structured entries: one per analyte. The server computes flags, critical status and calculated values.
  results: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(40),
        value: z.union([z.string().max(500), z.number()]).optional(),
        unit: z.string().trim().max(30).optional(),
        rows: z.array(z.object({ antibiotic: z.string().max(80), result: z.string().max(4) })).max(60).optional(),
      }),
    )
    .max(80)
    .optional(),
  // Who entered or verified a result is taken from the signed-in user, not from the request.
});

export const getLabOrdersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});
