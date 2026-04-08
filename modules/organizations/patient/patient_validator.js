import mongoose from "mongoose";
import { z, ZodError } from "zod";

export const searchPatientSchema = z
  .object({
    identifier: z.string().trim().min(1, "identifier is required"),
    identifierType: z.enum(["wrId", "email", "phone", "qr"]),
  })
  .superRefine((data, ctx) => {
    if (data.identifierType === "email") {
      const emailValid = z.string().email().safeParse(data.identifier);
      if (!emailValid.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email format",
          path: ["identifier"],
        });
      }
    }

    if (data.identifierType === "phone") {
      if (!/^\+?\d{7,15}$/.test(data.identifier)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid phone number",
          path: ["identifier"],
        });
      }
    }
  });

export const linkPatientSchema = z.object({
  patientIdentityId: z
    .string()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: "Invalid patientIdentityId",
    }),
});

export const validate = (schema) => {
  return (req, res, next) => {
    console.log("🚀 ~ validate ~ req:", req.body)
  try {
    req.validated = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: err.issues,
      });
    }

    return next(err);
  }
};
};