import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ObjectId",
  });

export const createEncounterSchema = z.object({
  patientId: objectIdSchema,
  encounterType: z
    .enum(["outpatient", "inpatient", "emergency", "telemedicine", "homecare"])
    .optional(),

  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),

  reasonForVisit: z.string().trim().max(500).optional(),
  chiefComplaint: z.string().trim().max(1000).optional(),
  status: z
    .enum([
      "active",
      "completed",
    ])
    .optional(),
  recordStatus: z.enum(["active", "archived", "entered-in-error"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  followUpRecommended: z.boolean().optional(),
  followUpDate: z.coerce.date().optional().nullable(),
});

export const updateEncounterSchema = z.object({
  status: z
    .enum([
      "active",
      "in-progress",
      "completed",
      "cancelled",
      "no-show",
    ])
    .optional(),
  endedAt: z.coerce.date().optional().nullable(),
  reasonForVisit: z.string().trim().max(500).optional(),
  chiefComplaint: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  followUpRecommended: z.boolean().optional(),
  followUpDate: z.coerce.date().optional().nullable(),
});

export const getEncounterByIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const getPatientEncountersParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientEncountersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});
