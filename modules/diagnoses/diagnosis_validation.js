import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createDiagnosisSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  source: z.enum(["patient", "provider", "imported"]).optional(),
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

  diagnosisName: z.string().trim().min(1).max(300),
  diagnosisType: z
    .enum(["provisional", "confirmed", "chronic", "resolved", "ruled-out"])
    .optional(),

  icd10Code: z.string().trim().max(20).optional(),
  clinicalStatus: z
    .enum(["active", "inactive", "resolved", "remission", "unknown"])
    .optional(),

  onsetDate: z.coerce.date().optional(),
  diagnosedAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const getPatientDiagnosesParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientDiagnosesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});