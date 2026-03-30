import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createProcedureSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  source: z.enum(["patient", "provider", "facility", "imported"]).optional(),
  createdContext: z
    .enum([
      "patient-app",
      "provider-chart",
      "facility-chart",
      "device",
      "imported",
      "system",
    ])
    .optional(),

  ownershipType: z.enum(["patient", "provider", "shared"]).optional(),
  visibility: z.enum(["private", "patient-visible", "provider-visible", "shared"]).optional(),
  patientAccess: z.enum(["full", "limited", "hidden-until-reviewed"]).optional(),
  patientVisible: z.boolean().optional(),

  procedureName: z.string().trim().min(1).max(300),
  procedureType: z
    .enum(["surgical", "diagnostic", "therapeutic", "minor", "major", "other"])
    .optional(),

  bodySite: z.string().trim().max(150).optional(),
  indication: z.string().trim().max(500).optional(),

  outcome: z
    .enum(["successful", "partial", "complication", "failed", "unknown"])
    .optional(),

  complications: z.string().trim().max(1000).optional(),
  facilityName: z.string().trim().max(250).optional(),
  performedAt: z.coerce.date().optional(),
  clinicalStatus: z
    .enum(["completed", "partial", "cancelled", "entered-in-error"])
    .optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const getPatientProceduresParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientProceduresQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});