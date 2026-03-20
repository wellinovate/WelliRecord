import mongoose from "mongoose";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ObjectId",
  });

export const createVitalSchema = z.object({
  patientId: objectIdSchema,
  providerId: objectIdSchema.optional(),
  organizationId: objectIdSchema.optional(),
  encounterId: objectIdSchema.optional(),

  source: z.enum(["patient", "provider", "device", "imported"]).optional(),
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
  visibility: z
    .enum(["private", "patient-visible", "provider-visible", "shared"])
    .optional(),
  patientAccess: z
    .enum(["full", "limited", "hidden-until-reviewed"])
    .optional(),
  patientVisible: z.boolean().optional(),

  bloodPressure: z
    .object({
      systolic: z.number().min(0).optional(),
      diastolic: z.number().min(0).optional(),
    })
    .optional(),

  heartRate: z.number().min(0).optional(),

  temperature: z
    .object({
      value: z.number(),
      unit: z.enum(["C", "F"]).optional(),
    })
    .optional(),

  respiratoryRate: z.number().min(0).optional(),
  oxygenSaturation: z.number().min(0).max(100).optional(),

  weight: z
    .object({
      value: z.number().min(0),
      unit: z.enum(["kg", "lb"]).optional(),
    })
    .optional(),

  height: z
    .object({
      value: z.number().min(0),
      unit: z.enum(["cm", "m", "ft", "in"]).optional(),
    })
    .optional(),

  bloodGlucose: z
    .object({
      value: z.number().min(0),
      unit: z.enum(["mg/dL", "mmol/L"]).optional(),
      fasting: z.boolean().optional(),
    })
    .optional(),

  measuredAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1500).optional(),
});

export const validateCreateVital = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (body.recordedBy && !mongoose.Types.ObjectId.isValid(body.recordedBy)) {
    errors.push("Invalid recordedBy");
  }

  if (
    body.source &&
    !["patient", "provider", "device", "imported"].includes(body.source)
  ) {
    errors.push("Invalid source");
  }

  const hasAnyVital =
    body.bloodPressure ||
    body.heartRate !== undefined ||
    body.temperature ||
    body.respiratoryRate !== undefined ||
    body.oxygenSaturation !== undefined ||
    body.weight ||
    body.height ||
    body.bloodGlucose;

  if (!hasAnyVital) {
    errors.push("At least one vital measurement is required");
  }

  if (
    body.bloodPressure &&
    ((body.bloodPressure.systolic !== undefined &&
      typeof body.bloodPressure.systolic !== "number") ||
      (body.bloodPressure.diastolic !== undefined &&
        typeof body.bloodPressure.diastolic !== "number"))
  ) {
    errors.push("bloodPressure values must be numbers");
  }

  if (
    body.heartRate !== undefined &&
    (typeof body.heartRate !== "number" || body.heartRate < 0)
  ) {
    errors.push("heartRate must be a positive number");
  }

  if (
    body.respiratoryRate !== undefined &&
    (typeof body.respiratoryRate !== "number" || body.respiratoryRate < 0)
  ) {
    errors.push("respiratoryRate must be a positive number");
  }

  if (
    body.oxygenSaturation !== undefined &&
    (typeof body.oxygenSaturation !== "number" ||
      body.oxygenSaturation < 0 ||
      body.oxygenSaturation > 100)
  ) {
    errors.push("oxygenSaturation must be between 0 and 100");
  }

  if (body.temperature?.unit && !["C", "F"].includes(body.temperature.unit)) {
    errors.push("temperature.unit must be C or F");
  }

  if (body.weight?.unit && !["kg", "lb"].includes(body.weight.unit)) {
    errors.push("weight.unit must be kg or lb");
  }

  if (
    body.height?.unit &&
    !["cm", "m", "ft", "in"].includes(body.height.unit)
  ) {
    errors.push("height.unit must be cm, m, ft, or in");
  }

  if (
    body.bloodGlucose?.unit &&
    !["mg/dL", "mmol/L"].includes(body.bloodGlucose.unit)
  ) {
    errors.push("bloodGlucose.unit must be mg/dL or mmol/L");
  }

  return errors;
};

export const validateUpdateVital = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  if (body.recordedBy && !mongoose.Types.ObjectId.isValid(body.recordedBy)) {
    errors.push("Invalid recordedBy");
  }

  if (
    body.source &&
    !["patient", "provider", "device", "imported"].includes(body.source)
  ) {
    errors.push("Invalid source");
  }

  if (body.temperature?.unit && !["C", "F"].includes(body.temperature.unit)) {
    errors.push("temperature.unit must be C or F");
  }

  if (body.weight?.unit && !["kg", "lb"].includes(body.weight.unit)) {
    errors.push("weight.unit must be kg or lb");
  }

  if (
    body.height?.unit &&
    !["cm", "m", "ft", "in"].includes(body.height.unit)
  ) {
    errors.push("height.unit must be cm, m, ft, or in");
  }

  if (
    body.bloodGlucose?.unit &&
    !["mg/dL", "mmol/L"].includes(body.bloodGlucose.unit)
  ) {
    errors.push("bloodGlucose.unit must be mg/dL or mmol/L");
  }

  return errors;
};



export const getPatientVitalsParamsSchema = z.object({
  patientId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid patientId",
  }),
});

export const getPatientVitalsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(10).optional(),
});