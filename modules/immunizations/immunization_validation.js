import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createImmunizationSchema = z.object({
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

  vaccineName: z.string().trim().min(1).max(250),
  vaccineCode: z.string().trim().max(50).optional(),
  manufacturer: z.string().trim().max(150).optional(),
  lotNumber: z.string().trim().max(100).optional(),
  doseNumber: z.number().min(1).optional(),
  series: z.string().trim().max(100).optional(),

  administrationRoute: z.enum(["oral", "im", "sc", "id", "nasal", "other"]).optional(),
  site: z.string().trim().max(100).optional(),

  administeredAt: z.coerce.date().optional(),
  nextDueDate: z.coerce.date().optional(),

  immunizationStatus: z
    .enum(["completed", "due", "overdue", "partial", "declined"])
    .optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const getPatientImmunizationsParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientImmunizationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});