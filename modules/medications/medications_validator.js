import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createMedicationSchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  source: z.enum(["patient", "provider", "pharmacy", "imported"]).optional(),
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

  medicationName: z.string().trim().min(1).max(200),
  genericName: z.string().trim().max(200).optional(),
  brandName: z.string().trim().max(200).optional(),

  dosage: z
    .object({
      value: z.number().min(0).optional(),
      unit: z.string().trim().max(50).optional(),
    })
    .optional(),

  form: z
    .enum([
      "tablet",
      "capsule",
      "syrup",
      "injection",
      "cream",
      "ointment",
      "drops",
      "inhaler",
      "suppository",
      "patch",
      "other",
    ])
    .optional(),

  route: z
    .enum([
      "oral",
      "iv",
      "im",
      "sc",
      "topical",
      "inhalation",
      "rectal",
      "nasal",
      "ophthalmic",
      "otic",
      "other",
    ])
    .optional(),

  frequency: z.string().trim().max(100).optional(),
  indication: z.string().trim().max(500).optional(),

  prescribedAt: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),

  medicationStatus: z.enum(["active", "completed", "stopped", "on-hold"]).optional(),
  adherence: z.enum(["unknown", "good", "partial", "poor"]).optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const getPatientMedicationsParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientMedicationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});