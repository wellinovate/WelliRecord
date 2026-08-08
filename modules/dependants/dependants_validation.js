import { z } from "zod";

export const createDependantSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(200),
  dateOfBirth: z.coerce.date({
    required_error: "Date of birth is required",
    invalid_type_error: "Date of birth is invalid",
  }),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
});

// Blood group and genotype are accepted here the same way they are on
// the adult UserProfile — self-reported by the parent, unverified.
// See UserProfile.bloodGroup/genotype comment: lab results are the
// authoritative source when they exist. Nothing here marks these as
// clinically verified.
export const updateDependantSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  avatar: z.string().trim().url().optional().nullable(),
  bloodGroup: z
    .enum(["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "Unknown"])
    .optional()
    .nullable(),
  genotype: z
    .enum(["AA", "AS", "AC", "SS", "SC", "Unknown"])
    .optional()
    .nullable(),
});

