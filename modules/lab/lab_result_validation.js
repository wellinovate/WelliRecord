import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createLabResultSchema = z.object({
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

  specimen: z.string().trim().max(100).optional(),
  resultValue: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(50).optional(),

  referenceRange: z
    .object({
      min: z.number().nullable().optional(),
      max: z.number().nullable().optional(),
      text: z.string().trim().max(100).optional(),
    })
    .optional(),

  interpretation: z
    .enum(["low", "normal", "high", "positive", "negative", "abnormal", "unknown"])
    .optional(),

  collectedAt: z.coerce.date().optional(),
  resultedAt: z.coerce.date().optional(),

  verificationStatus: z
    .enum(["unverified", "patient-uploaded", "provider-reviewed", "lab-verified"])
    .optional(),

  notes: z.string().trim().max(1500).optional(),

  attachments: z
    .array(
      z.object({
        fileId: objectIdSchema,
        label: z.string().trim().max(100).optional(),
      }),
    )
    .optional(),
});

export const getPatientLabResultsParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const getPatientLabResultsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});