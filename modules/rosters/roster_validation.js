import mongoose from "mongoose";
import { z } from "zod";
import { STAFF_ROLE_TYPES, DUTY_TYPE_VALUES } from "./duty_assignment_model.js";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
  message: "Expected 24-hour time in HH:MM format",
});

export const createRosterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  notes: z.string().trim().max(1500).optional(),
}).refine((data) => data.periodEnd >= data.periodStart, {
  message: "periodEnd must be on or after periodStart",
  path: ["periodEnd"],
});

export const createDutyAssignmentSchema = z.object({
  staffId: objectIdSchema,
  staffRole: z.enum(STAFF_ROLE_TYPES),
  duty: z.enum(DUTY_TYPE_VALUES),
  location: z.string().trim().min(1).max(150),
  date: z.coerce.date(),
  startTime: timeSchema,
  endTime: timeSchema,
  backupStaffId: objectIdSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateDutyAssignmentSchema = z.object({
  staffRole: z.enum(STAFF_ROLE_TYPES).optional(),
  duty: z.enum(DUTY_TYPE_VALUES).optional(),
  location: z.string().trim().min(1).max(150).optional(),
  date: z.coerce.date().optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  backupStaffId: objectIdSchema.nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const cancelDutyAssignmentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const getRostersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});
