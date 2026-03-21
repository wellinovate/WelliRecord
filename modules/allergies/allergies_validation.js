import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createAllergySchema = z.object({
  patientId: objectIdSchema,
  encounterId: objectIdSchema.optional(),

  source: z.enum(["patient", "provider", "lab", "imported"]).optional(),
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

  allergen: z.string().trim().min(1).max(200),
  allergyType: z.enum(["drug", "food", "environment", "insect", "other"]),
  reaction: z.string().trim().max(500).optional(),
  severity: z.enum(["mild", "moderate", "severe", "life-threatening", "unknown"]).optional(),
  clinicalStatus: z.enum(["active", "resolved", "entered-in-error"]).optional(),

  onsetDate: z.coerce.date().optional(),
  lastReactionDate: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional(),

  confirmed: z.boolean().optional(),
  verificationStatus: z
    .enum(["unverified", "patient-reported", "provider-verified", "lab-supported"])
    .optional(),

  notes: z.string().trim().max(1500).optional(),
});

export const getPatientAllergiesParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientAllergiesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});