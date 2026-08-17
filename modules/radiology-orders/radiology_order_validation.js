import mongoose from "mongoose";
import { z } from "zod";
import {
  RADIOLOGY_ORDER_WORKFLOW_STAGES,
  RADIOLOGY_ORDER_MODALITIES,
} from "./radiology_order_model.js";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createRadiologyOrderSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  examName: z.string().trim().min(1).max(250),
  modality: z.enum(RADIOLOGY_ORDER_MODALITIES).optional(),
  bodyPart: z.string().trim().max(150).optional(),

  priority: z.enum(["routine", "urgent"]).optional(),
  clinicalIndication: z.string().trim().max(500).optional(),

  doctorName: z.string().trim().max(200).optional(),
  doctorPhone: z.string().trim().max(30).optional(),

  price: z.number().min(0).optional(),
  paymentStatus: z.enum(["paid", "pending"]).optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const updateRadiologyOrderStatusSchema = z.object({
  status: z.enum(RADIOLOGY_ORDER_WORKFLOW_STAGES),
});

export const publishRadiologyReportSchema = z.object({
  findings: z.string().trim().min(1).max(5000),
  impression: z.string().trim().max(2000).optional(),
  radiologistName: z.string().trim().max(200).optional(),
  isCritical: z.boolean().optional(),
});

export const getRadiologyOrdersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});
